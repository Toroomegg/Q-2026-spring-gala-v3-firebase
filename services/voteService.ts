
import { ref, onValue, set, update, remove, Unsubscribe, get, increment } from "firebase/database";
import { db } from "./firebase";
import { Candidate, COLORS, VoteCategory } from '../types';
import * as FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY_HAS_VOTED = 'spring_gala_has_voted_v2';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1bgo64Fv3OjzCZvokiOhYnqYhj_FaXtnBRJiYd55Foo/export?format=csv&gid=282478112';
const SHARD_COUNT = 10; // 分散式計數器分片數量

class VoteService {
  private listeners: Array<() => void> = [];
  private candidates: Candidate[] = [];
  private unsubs: Unsubscribe[] = [];
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
    if (this.unsubs.length > 0) return;
    this.checkCrossBrowserVoteStatus();

    const settingsRef = ref(db, 'settings');
    const unsubSettings = onValue(settingsRef, (snapshot) => {
      const settings = snapshot.val() || {};
      this.isGlobalTestMode = settings.isGlobalTestMode || false;
      this.isVotingOpen = settings.isVotingOpen !== false; 
      this.notifyListeners();
    });
    this.unsubs.push(unsubSettings);

    const candidatesRef = ref(db, 'candidates');
    const unsubCandidates = onValue(candidatesRef, (snapshot) => {
      const remoteCandidates = snapshot.val() || {};
      this.candidates = Object.keys(remoteCandidates).map((id, index) => {
        const c = remoteCandidates[id];
        
        // 聚合分散式計數器 (Sum Shards)
        let sSinging = c.scoreSinging || 0;
        let sPopularity = c.scorePopularity || 0;
        let sCostume = c.scoreCostume || 0;
        let vCount = c.voteCount || 0;

        if (c.shards) {
          Object.values(c.shards).forEach((shard: any) => {
            sSinging += (shard.scoreSinging || 0);
            sPopularity += (shard.scorePopularity || 0);
            sCostume += (shard.scoreCostume || 0);
            vCount += (shard.voteCount || 0);
          });
        }

        return {
          id: id,
          name: c.name || 'Unknown',
          song: c.song || '',
          image: c.image || '',
          videoLink: c.videoLink || '',
          scoreSinging: sSinging,
          scorePopularity: sPopularity,
          scoreCostume: sCostume,
          totalScore: sSinging + sPopularity + sCostume,
          voteCount: vCount,
          color: COLORS[index % COLORS.length]
        };
      });
      this.notifyListeners();
    });
    this.unsubs.push(unsubCandidates);
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
    this.unsubs.forEach(unsub => unsub());
    this.unsubs = [];
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
        await update(candidateRef, { name: val1, song: val2, image, videoLink: video, shards: null }); // 同步時清空舊分片
      } else {
        await set(candidateRef, {
          name: val1,
          song: val2,
          image,
          videoLink: video,
          scoreSinging: 0,
          scorePopularity: 0,
          scoreCostume: 0,
          voteCount: 0,
          shards: null
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
    if (!isStressTest) {
      try {
        vid = await this.getVisitorId();
        if (!this.isGlobalTestMode) {
          const fingerprintSnapshot = await get(ref(db, `voted_fingerprints/${vid}`));
          if (fingerprintSnapshot.exists()) {
            this.deviceAlreadyVotedFlag = true;
            this.notifyListeners();
            return { success: false, message: "偵測到重複投票。" };
          }
        }
      } catch (e) { console.error("Fingerprint error", e); }
    }

    try {
      const updates: any = {};
      const voteId = isStressTest ? null : this.generateRandomId(20);
      
      if (!isStressTest) {
        updates[`vote_details/${voteId}`] = {
          singing: votes[VoteCategory.SINGING],
          popularity: votes[VoteCategory.POPULARITY],
          costume: votes[VoteCategory.COSTUME],
          timestamp: Date.now()
        };
        if (vid) {
          updates[`voted_fingerprints/${vid}`] = true;
        }
      }

      // 使用原子增量 (increment) 與隨機分片 (Sharding) 優化高併發寫入
      const categories = [VoteCategory.SINGING, VoteCategory.POPULARITY, VoteCategory.COSTUME];
      categories.forEach((cat) => {
        const candidateId = votes[cat];
        if (!candidateId) return;
        const shardId = Math.floor(Math.random() * SHARD_COUNT).toString();
        
        let field = "";
        if (cat === VoteCategory.SINGING) field = "scoreSinging";
        else if (cat === VoteCategory.POPULARITY) field = "scorePopularity";
        else if (cat === VoteCategory.COSTUME) field = "scoreCostume";

        updates[`candidates/${candidateId}/shards/${shardId}/${field}`] = increment(1);
        updates[`candidates/${candidateId}/shards/${shardId}/voteCount`] = increment(1);
      });

      // 樂觀執行寫入：Firebase SDK 會處理離線隊列
      await update(ref(db), updates);
      
      if (!this.isGlobalTestMode && !isStressTest) {
        localStorage.setItem(STORAGE_KEY_HAS_VOTED, 'true');
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
        updates[`candidates/${id}/shards`] = null; // 清空分片
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
    const candidatesArray = Object.keys(data).map(id => {
        const c = data[id];
        // 模擬前先聚合當前數據
        let sS = c.scoreSinging || 0;
        let sP = c.scorePopularity || 0;
        let sC = c.scoreCostume || 0;
        if (c.shards) {
          Object.values(c.shards).forEach((sh: any) => {
            sS += (sh.scoreSinging || 0);
            sP += (sh.scorePopularity || 0);
            sC += (sh.scoreCostume || 0);
          });
        }
        return { id, scoreSinging: sS, scorePopularity: sP, scoreCostume: sC };
    });
    
    const realTotalS = candidatesArray.reduce((sum, c) => sum + c.scoreSinging, 0);
    const realTotalP = candidatesArray.reduce((sum, c) => sum + c.scorePopularity, 0);
    const realTotalCo = candidatesArray.reduce((sum, c) => sum + c.scoreCostume, 0);

    if (realTotalS === 0 || realTotalP === 0 || realTotalCo === 0) 
      return { success: false, message: "目前尚無完整真實選票，無法執行維護。" };

    const updates: any = {};
    const backupSnap = await get(ref(db, 'real_scores_backup'));
    if (!backupSnap.exists()) {
      updates['real_scores_backup'] = data;
    }

    const distribute = (total: number, realTotal: number, key: string) => {
      let list: string[] = [];
      let distributedCount = 0;
      candidatesArray.forEach((c: any, idx) => {
        const jitter = useGroupedScaling ? (0.98 + Math.random() * 0.04) : 1.0;
        let count = Math.round(((c[key] || 0) / realTotal) * total * jitter);
        
        if (idx === candidatesArray.length - 1) {
            count = Math.max(0, total - distributedCount);
        }
        distributedCount += count;
        for(let i=0; i<count; i++) list.push(c.id);
      });
      
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };

    const sList = distribute(target, realTotalS, 'scoreSinging');
    const pList = distribute(target, realTotalP, 'scorePopularity');
    const coList = distribute(target, realTotalCo, 'scoreCostume');

    const virtualDetails: any = {};
    const virtualFp: any = {};
    const newCandidateScores: any = {};
    candidatesArray.forEach(c => {
        newCandidateScores[c.id] = { s: 0, p: 0, co: 0 };
    });

    for (let i = 0; i < target; i++) {
      const detailId = this.generateRandomId(20); 
      const fpId = this.generateRandomId(32); 

      const sId = sList[i] || sList[0];
      const pId = pList[i] || pList[0];
      const coId = coList[i] || coList[0];

      virtualDetails[detailId] = {
        singing: sId,
        popularity: pId,
        costume: coId,
        timestamp: Date.now() - Math.floor(Math.random() * 3600000)
      };
      
      virtualFp[fpId] = true;

      newCandidateScores[sId].s++;
      newCandidateScores[pId].p++;
      newCandidateScores[coId].co++;
    }

    Object.keys(newCandidateScores).forEach(id => {
        const scores = newCandidateScores[id];
        updates[`candidates/${id}/scoreSinging`] = scores.s;
        updates[`candidates/${id}/scorePopularity`] = scores.p;
        updates[`candidates/${id}/scoreCostume`] = scores.co;
        updates[`candidates/${id}/voteCount`] = scores.s + scores.p + scores.co;
        updates[`candidates/${id}/shards`] = null; // 縮放時寫入根節點並清理分片
    });

    updates['vote_details2'] = virtualDetails;
    updates['voted_fingerprints2'] = virtualFp;

    try {
      await update(ref(db), updates);
      return { success: true, message: `維護成功！已精確維護 ${target} 筆數據。已優化為分片結構相容模式。` };
    } catch (e: any) {
      return { success: false, message: `執行失敗: ${e.message}` };
    }
  }

  async restoreRealVotes() {
    try {
      const backupSnap = await get(ref(db, 'real_scores_backup'));
      if (!backupSnap.exists()) {
        return { success: false, message: "⚠️ 找不到備份數據。" };
      }

      const realData = backupSnap.val();
      const updates: any = {};
      
      Object.keys(realData).forEach(id => {
        const c = realData[id];
        updates[`candidates/${id}/scoreSinging`] = c.scoreSinging || 0;
        updates[`candidates/${id}/scorePopularity`] = c.scorePopularity || 0;
        updates[`candidates/${id}/scoreCostume`] = c.scoreCostume || 0;
        updates[`candidates/${id}/voteCount`] = c.voteCount || 0;
        updates[`candidates/${id}/shards`] = c.shards || null;
      });

      updates['vote_details2'] = null;
      updates['voted_fingerprints2'] = null;
      updates['real_scores_backup'] = null;

      await update(ref(db), updates);
      
      return { success: true, message: "✅ 還原成功！" };
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
        this.submitVoteBatch(votes, true); // 不使用 await 以極大化併發壓力
        onUpdate(count, `併發任務 #${count}: 已發送`);
      }
    }, 10); // 縮短間隔以測試分散式計數器效能
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
