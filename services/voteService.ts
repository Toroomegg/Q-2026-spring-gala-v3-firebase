import { ref, onValue, runTransaction, set, update, remove, Unsubscribe, get } from "firebase/database";
import { db } from "./firebase";
import { Candidate, COLORS, VoteCategory } from '../types';
import * as FingerprintJS from 'fingerprintjs';

const STORAGE_KEY_HAS_VOTED = 'spring_gala_has_voted_v2';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1bgo64Fv3OjzCZvokiOhYnqYhj_FaXtnZBRJiYd55Foo/export?format=csv&gid=282478112';

class VoteService {
  private listeners: Array<() => void> = [];
  private candidates: Candidate[] = [];
  private dbUnsubscribe: Unsubscribe | null = null;
  private deviceAlreadyVotedFlag = false;
  private fpPromise: Promise<string> | null = null;
  
  public isGlobalTestMode = false;
  public isVotingOpen = true; 
  public isRunningStressTest = false;
  private stressTestInterval: any = null;

  constructor() {}

  private async getVisitorId(): Promise<string> {
    if (!this.fpPromise) {
      this.fpPromise = (async () => {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId;
      })();
    }
    return this.fpPromise;
  }

  private generateRandomId(length: number = 32): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }

  getCandidates(): Candidate[] { return this.candidates; }
  
  hasVoted(): boolean { 
    return !!localStorage.getItem(STORAGE_KEY_HAS_VOTED) || this.deviceAlreadyVotedFlag; 
  }

  startPolling() {
    if (this.dbUnsubscribe) return;
    this.checkCrossBrowserVoteStatus();
    const dbRef = ref(db, '/');
    this.dbUnsubscribe = onValue(dbRef, (snapshot) => {
      const data = snapshot.val() || {};
      const remoteCandidates = data.candidates || {};
      const settings = data.settings || {};
      this.isGlobalTestMode = settings.isGlobalTestMode || false;
      this.isVotingOpen = settings.isVotingOpen !== false; 
      this.candidates = Object.keys(remoteCandidates).map((id, index) => {
        const c = remoteCandidates[id];
        return {
          id: id,
          name: c.name || 'Unknown',
          song: c.song || '',
          image: c.image || '',
          videoLink: c.videoLink || '',
          scoreSinging: c.scoreSinging || 0,
          scorePopularity: c.scorePopularity || 0,
          scoreCostume: c.scoreCostume || 0,
          totalScore: (c.scoreSinging || 0) + (c.scorePopularity || 0) + (c.scoreCostume || 0),
          voteCount: c.voteCount || 0,
          color: COLORS[index % COLORS.length]
        };
      });
      this.notifyListeners();
    });
  }

  private async checkCrossBrowserVoteStatus() {
    try {
      const vid = await this.getVisitorId();
      const snapshot = await get(ref(db, `voted_fingerprints/${vid}`));
      if (snapshot.exists()) {
        this.deviceAlreadyVotedFlag = true;
        this.notifyListeners();
      }
    } catch (e) {
      console.warn("Fingerprint check skipped", e);
    }
  }

  stopPolling() {
    if (this.dbUnsubscribe) { this.dbUnsubscribe(); this.dbUnsubscribe = null; }
  }

  async setVotingStatus(open: boolean) {
    await update(ref(db, 'settings'), { isVotingOpen: open });
  }

  async setGlobalTestMode(test: boolean) {
    await update(ref(db, 'settings'), { isGlobalTestMode: test });
  }

  private async processCSVLines(lines: string[]): Promise<{ count: number, message: string }> {
    const rows = lines.slice(1);
    let count = 0;
    for (let row of rows) {
      if (!row.trim()) continue;
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => col.trim().replace(/^"|"$/g, ''));
      if (columns.length < 3) continue;
      const id = columns[0];
      const val1 = columns[1];
      const val2 = columns[2];
      const image = columns[3] || "";
      const video = columns[4] || "";
      if (id === "VOTING_STATUS") { await this.setVotingStatus(val1 === "OPEN"); continue; }
      if (id === "SETTING_MODE") { await this.setGlobalTestMode(val1 === "TEST"); continue; }
      if (!id || id.length < 2) continue;
      const candidateRef = ref(db, `candidates/${id}`);
      const snapshot = await get(candidateRef);
      if (snapshot.exists()) {
        await update(candidateRef, { name: val1, song: val2, image, videoLink: video });
      } else {
        await set(candidateRef, {
          name: val1,
          song: val2,
          image,
          videoLink: video,
          scoreSinging: 0,
          scorePopularity: 0,
          scoreCostume: 0,
          voteCount: 0
        });
      }
      count++;
    }
    return { count, message: `同步完成！已成功更新 ${count} 位參賽者。` };
  }

  async syncCandidatesFromGoogleSheet(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(SHEET_CSV_URL);
      if (!response.ok) throw new Error("Google Sheet 連結讀取失敗。請嘗試使用手動貼上 CSV。");
      const csvText = await response.text();
      const res = await this.processCSVLines(csvText.split(/\r?\n/));
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, message: `自動同步失敗: ${e.message}` };
    }
  }

  async syncCandidatesFromText(csvText: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.processCSVLines(csvText.split(/\r?\n/));
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, message: `手動同步失敗: ${e.message}` };
    }
  }

  async submitVoteBatch(votes: { [key in VoteCategory]: string }, isStressTest = false): Promise<{ success: boolean; message?: string }> {
    if (!isStressTest && !this.isVotingOpen) return { success: false, message: "投票通道已關閉。" };
    if (!isStressTest && !this.isGlobalTestMode && this.hasVoted()) return { success: false, message: "您已經參與過投票囉！" };
    
    let vid = "";
    if (!isStressTest && !this.isGlobalTestMode) {
      try {
        vid = await this.getVisitorId();
        const fingerprintSnapshot = await get(ref(db, `voted_fingerprints/${vid}`));
        if (fingerprintSnapshot.exists()) {
          this.deviceAlreadyVotedFlag = true;
          this.notifyListeners();
          return { success: false, message: "偵測到重複投票。" };
        }
      } catch (e) { console.error("Fingerprint error", e); }
    }

    try {
      if (!isStressTest && !this.isGlobalTestMode) {
        const voteId = this.generateRandomId(20);
        await set(ref(db, `vote_details/${voteId}`), {
          singing: votes[VoteCategory.SINGING],
          popularity: votes[VoteCategory.POPULARITY],
          costume: votes[VoteCategory.COSTUME],
          timestamp: Date.now()
        });
      }

      const categories = [VoteCategory.SINGING, VoteCategory.POPULARITY, VoteCategory.COSTUME];
      const promises = categories.map(async (cat) => {
        const candidateId = votes[cat];
        if (!candidateId) return;
        const candidateRef = ref(db, `candidates/${candidateId}`);
        return runTransaction(candidateRef, (currentData) => {
          if (currentData) {
            if (cat === VoteCategory.SINGING) currentData.scoreSinging = (currentData.scoreSinging || 0) + 1;
            else if (cat === VoteCategory.POPULARITY) currentData.scorePopularity = (currentData.scorePopularity || 0) + 1;
            else if (cat === VoteCategory.COSTUME) currentData.scoreCostume = (currentData.scoreCostume || 0) + 1;
            currentData.voteCount = (currentData.voteCount || 0) + 1;
          }
          return currentData;
        });
      });
      await Promise.all(promises);
      
      if (!this.isGlobalTestMode && !isStressTest) {
        localStorage.setItem(STORAGE_KEY_HAS_VOTED, 'true');
        if (vid) {
          await set(ref(db, `voted_fingerprints/${vid}`), true);
        }
        this.deviceAlreadyVotedFlag = true;
        this.notifyListeners();
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  async testConnection(): Promise<{ message: string }> {
    try {
      await get(ref(db, 'settings'));
      return { message: "連線成功！Firebase 資料庫運作正常。" };
    } catch (e: any) {
      return { message: `連線失敗: ${e.message}` };
    }
  }

  clearMyHistory() {
    localStorage.removeItem(STORAGE_KEY_HAS_VOTED);
    this.deviceAlreadyVotedFlag = false;
    this.notifyListeners();
  }

  async resetAllRemoteVotes() {
    const snapshot = await get(ref(db, 'candidates'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const updates: any = {};
      Object.keys(data).forEach(id => {
        updates[`candidates/${id}/scoreSinging`] = 0;
        updates[`candidates/${id}/scorePopularity`] = 0;
        updates[`candidates/${id}/scoreCostume`] = 0;
        updates[`candidates/${id}/voteCount`] = 0;
      });
      updates['voted_fingerprints'] = null;
      updates['voted_fingerprints2'] = null;
      updates['vote_details'] = null;
      updates['vote_details2'] = null;
      updates['real_scores_backup'] = null;
      await update(ref(db), updates);
    }
  }

  async deleteCandidate(id: string) {
    await remove(ref(db, `candidates/${id}`));
  }

  async scaleVotesProportionally(target: number, useGroupedScaling: boolean = false) {
    const snapshot = await get(ref(db, 'candidates'));
    if (!snapshot.exists()) return { success: false, message: "無參賽者資料" };
    
    const data = snapshot.val();
    const candidatesArray = Object.keys(data).map(id => ({ id, ...data[id] }));
    const currentTotal = candidatesArray.reduce((sum, c) => sum + (c.voteCount || 0), 0);
    
    if (currentTotal === 0) return { success: false, message: "目前尚無真實選票，無法執行等比縮放。" };

    const updates: any = {};
    const backupSnap = await get(ref(db, 'real_scores_backup'));
    if (!backupSnap.exists()) {
      updates['real_scores_backup'] = data;
    }

    const ratio = target / currentTotal;
    
    const getWeightsForCategory = (catKey: string) => {
      const uniqueScores = Array.from(new Set(candidatesArray.map(c => c[catKey] || 0)));
      const weights: Record<number, number> = {};
      uniqueScores.forEach(score => {
        const jitter = useGroupedScaling ? (0.95 + Math.random() * 0.1) : 1.0;
        weights[score] = ratio * jitter;
      });
      return weights;
    };

    const singingWeights = getWeightsForCategory('scoreSinging');
    const popularityWeights = getWeightsForCategory('scorePopularity');
    const costumeWeights = getWeightsForCategory('scoreCostume');

    const virtualDetails: any = {};
    const virtualFp: any = {};

    candidatesArray.forEach(c => {
      const newS = Math.round((c.scoreSinging || 0) * singingWeights[c.scoreSinging || 0]);
      const newP = Math.round((c.scorePopularity || 0) * popularityWeights[c.scorePopularity || 0]);
      const newCo = Math.round((c.scoreCostume || 0) * costumeWeights[c.scoreCostume || 0]);
      const newTotal = newS + newP + newCo;

      updates[`candidates/${c.id}/scoreSinging`] = newS;
      updates[`candidates/${c.id}/scorePopularity`] = newP;
      updates[`candidates/${c.id}/scoreCostume`] = newCo;
      updates[`candidates/${c.id}/voteCount`] = newTotal;

      if (useGroupedScaling) {
        const logCount = Math.min(Math.floor(newTotal / 10) + 1, 30);
        for(let i=0; i < logCount; i++) {
           const vId = 'sim_' + this.generateRandomId(20);
           virtualDetails[vId] = { target: c.id, timestamp: Date.now(), is_simulated: true };
           virtualFp[vId] = true;
        }
      }
    });

    if (useGroupedScaling) {
      updates['vote_details2'] = virtualDetails;
      updates['voted_fingerprints2'] = virtualFp;
    }

    try {
      await update(ref(db), updates);
      return { success: true, message: `模擬成功！已執行「分群擬真」加權與虛擬紀錄生成。` };
    } catch (e: any) {
      return { success: false, message: `執行失敗: ${e.message}` };
    }
  }

  async restoreRealVotes() {
    try {
      const backupSnap = await get(ref(db, 'real_scores_backup'));
      if (!backupSnap.exists()) {
        return { success: false, message: "⚠️ 找不到備份數據。目前資料可能已是真實狀態。" };
      }

      const realData = backupSnap.val();
      const updates: any = {};
      
      Object.keys(realData).forEach(id => {
        const c = realData[id];
        updates[`candidates/${id}/scoreSinging`] = c.scoreSinging || 0;
        updates[`candidates/${id}/scorePopularity`] = c.scorePopularity || 0;
        updates[`candidates/${id}/scoreCostume`] = c.scoreCostume || 0;
        updates[`candidates/${id}/voteCount`] = c.voteCount || 0;
      });

      updates['vote_details2'] = null;
      updates['voted_fingerprints2'] = null;
      updates['real_scores_backup'] = null;

      await update(ref(db), updates);
      
      return { success: true, message: "✅ 還原成功！前台分數已恢復至真實狀態，虛擬膨脹紀錄已移除，真實紀錄完整保留。" };
    } catch (e: any) {
      return { success: false, message: `還原失敗: ${e.message}` };
    }
  }

  runStressTest(target: number, onUpdate: (count: number, log: string) => void) {
    this.isRunningStressTest = true;
    this.notifyListeners();
    let count = 0;
    this.stressTestInterval = setInterval(async () => {
      if (count >= target || !this.isRunningStressTest) {
        this.stopStressTest();
        return;
      }
      count++;
      const cats = this.candidates.map(c => c.id);
      if (cats.length > 0) {
        const votes = {
          [VoteCategory.SINGING]: cats[Math.floor(Math.random() * cats.length)],
          [VoteCategory.POPULARITY]: cats[Math.floor(Math.random() * cats.length)],
          [VoteCategory.COSTUME]: cats[Math.floor(Math.random() * cats.length)],
        };
        await this.submitVoteBatch(votes, true);
        onUpdate(count, `任務 #${count}: 模擬成功完成`);
      }
    }, 50);
  }

  stopStressTest() {
    this.isRunningStressTest = false;
    if (this.stressTestInterval) {
      clearInterval(this.stressTestInterval);
      this.stressTestInterval = null;
    }
    this.notifyListeners();
  }
}

export const voteService = new VoteService();
