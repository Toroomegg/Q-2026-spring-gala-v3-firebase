
import { ref, onValue, set, update, remove, Unsubscribe, get, increment } from "firebase/database";
import { db } from "./firebase";
import { Candidate, COLORS, VoteCategory } from '../types';
import * as FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY_HAS_VOTED = 'spring_gala_has_voted_v2';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1bgo64Fv3OjzCZvokiOhYnqYhj_FaXtnBRJiYd55Foo/export?format=csv&gid=282478112';
const SHARD_COUNT = 10; 

class VoteService {
  private listeners: Array<() => void> = [];
  private candidates: Candidate[] = [];
  private unsubs: Unsubscribe[] = [];
  private deviceAlreadyVotedFlag = false;
  private fpPromise: Promise<string> | null = null;
  
  public isGlobalTestMode = false;
  public isVotingOpen = true; 
  public useStaffVerification = true; 
  public isRunningStressTest = false;
  private stressTestInterval: any = null;

  // Staff ID related states
  public masterKeyCount = 0;
  public authorizedStaffCount = 0;

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
      this.useStaffVerification = settings.useStaffVerification !== false;
      this.notifyListeners();
    });
    this.unsubs.push(unsubSettings);

    const statsRef = ref(db, 'stats');
    const unsubStats = onValue(statsRef, (snapshot) => {
      const stats = snapshot.val() || {};
      this.masterKeyCount = stats.masterKeyCount || 0;
      this.authorizedStaffCount = stats.authorizedStaffCount || 0;
      this.notifyListeners();
    });
    this.unsubs.push(unsubStats);

    const candidatesRef = ref(db, 'candidates');
    const unsubCandidates = onValue(candidatesRef, (snapshot) => {
      const remoteCandidates = snapshot.val() || {};
      this.candidates = Object.keys(remoteCandidates).map((id, index) => {
        const c = remoteCandidates[id];
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

  async setStaffVerification(enabled: boolean) {
    await update(ref(db, 'settings'), { useStaffVerification: enabled });
  }

  async uploadStaffIds(csvText: string): Promise<{ success: boolean; message: string }> {
    try {
      const lines = csvText.split(/\r?\n/);
      const updates: any = {};
      let count = 0;
      
      lines.forEach(line => {
        const id = line.trim().toUpperCase(); 
        if (id.length === 8) {
          updates[`staff_list/${id}`] = { used: false };
          count++;
        }
      });

      if (count === 0) return { success: false, message: "未偵測到有效的 8 碼工號。" };

      await update(ref(db), updates);
      await update(ref(db, 'stats'), { authorizedStaffCount: count });
      await update(ref(db, 'settings'), { useStaffVerification: true });
      return { success: true, message: `成功上傳 ${count} 組工號名單！` };
    } catch (e: any) {
      return { success: false, message: `上傳失敗: ${e.message}` };
    }
  }

  async purgeStaffVerification(): Promise<{ success: boolean; message: string }> {
    try {
      const updates: any = {};
      updates['staff_list'] = null;
      updates['stats/masterKeyCount'] = 0;
      updates['stats/authorizedStaffCount'] = 0;
      updates['settings/useStaffVerification'] = false;
      await update(ref(db), updates);
      return { success: true, message: "工號名單已徹底清空，系統回復為開放投票模式。" };
    } catch (e: any) {
      return { success: false, message: `操作失敗: ${e.message}` };
    }
  }

  async resetStaffVotingStatus() {
    const snapshot = await get(ref(db, 'staff_list'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const updates: any = {};
      Object.keys(data).forEach(id => {
        updates[`staff_list/${id}/used`] = false;
      });
      updates['stats/masterKeyCount'] = 0;
      await update(ref(db), updates);
      return { success: true, message: "工號投票狀態已重置。" };
    }
    return { success: false, message: "無工號資料可重置。" };
  }

  async submitVoteBatch(votes: { [key in VoteCategory]: string }, rawStaffId: string, isStressTest = false): Promise<{ success: boolean; message?: string }> {
    if (!isStressTest && !this.isVotingOpen) return { success: false, message: "投票通道已關閉。" };
    
    const staffId = rawStaffId.trim().toUpperCase();
    const needsVerification = this.useStaffVerification && !isStressTest;
    const isMasterKey = staffId === "16888";
    
    if (needsVerification && !isMasterKey) {
        if (!this.isGlobalTestMode && this.hasVoted()) return { success: false, message: "您已經參與過投票囉！" };
        
        if (staffId.length !== 8) {
            return { success: false, message: "請輸入正確的 8 碼工號。" };
        }

        const staffRef = ref(db, `staff_list/${staffId}`);
        const staffSnap = await get(staffRef);
        
        if (!staffSnap.exists()) {
            return { success: false, message: "查無此工號，請確認後再試。" };
        }
        
        if (staffSnap.val().used === true && !this.isGlobalTestMode) {
            return { success: false, message: "此工號已參與過投票。" };
        }
    } else if (!isStressTest && !this.isGlobalTestMode) {
        if (this.hasVoted()) return { success: false, message: "您已經參與過投票囉！" };
    }

    let vid = "";
    if (!isStressTest && (needsVerification ? !isMasterKey : true)) {
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
          staffId: needsVerification ? staffId : "anonymous",
          isMasterKey: isMasterKey,
          timestamp: Date.now()
        };
        
        if (isMasterKey) {
            updates['stats/masterKeyCount'] = increment(1);
        } else if (needsVerification) {
            updates[`staff_list/${staffId}/used`] = true;
        }

        if (vid && !isMasterKey) {
            updates[`voted_fingerprints/${vid}`] = true;
        }
      }

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

      await update(ref(db), updates);
      
      if (!this.isGlobalTestMode && !isStressTest && !isMasterKey) {
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
        updates[`candidates/${id}/shards`] = null; 
      });
      updates['voted_fingerprints'] = null;
      updates['voted_fingerprints2'] = null;
      updates['vote_details'] = null;
      updates['vote_details2'] = null;
      updates['real_scores_backup'] = null;
      updates['simulation_logs'] = null;
      updates['stats/masterKeyCount'] = 0;
      await update(ref(db), updates);
    }
  }

  async deleteCandidate(id: string) {
    await remove(ref(db, `candidates/${id}`));
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
        await update(candidateRef, { name: val1, song: val2, image, videoLink: video, shards: null });
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

  async syncCandidatesFromText(csvText: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.processCSVLines(csvText.split(/\r?\n/));
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, message: `手動同步失敗: ${e.message}` };
    }
  }

  async scaleVotesProportionally(target: number, useGroupedScaling: boolean = false) {
    const snapshot = await get(ref(db, 'candidates'));
    if (!snapshot.exists()) return { success: false, message: "無參賽者資料" };
    
    const data = snapshot.val();
    const updates: any = {};
    
    // 1. 處理先前的模擬工號還原 (避免重複堆疊)
    const logSnap = await get(ref(db, 'simulation_logs/inflated_staff_ids'));
    let previouslyInflatedIds: string[] = [];
    if (logSnap.exists()) {
        previouslyInflatedIds = logSnap.val() || [];
        previouslyInflatedIds.forEach(id => {
            updates[`staff_list/${id}/used`] = false;
        });
    }

    // 2. 備份真實數據 (如果尚未備份)
    const backupSnap = await get(ref(db, 'real_scores_backup'));
    let realBaseData = data;
    if (backupSnap.exists()) {
        realBaseData = backupSnap.val();
    } else {
        updates['real_scores_backup'] = data;
    }

    // 3. 提取真實得分 (計算比例)
    const candidatesArray = Object.keys(realBaseData).map(id => {
        const c = realBaseData[id];
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
    const currentRealVotesCount = Math.max(realTotalS, realTotalP, realTotalCo);

    if (realTotalS === 0 || realTotalP === 0 || realTotalCo === 0) 
      return { success: false, message: "目前尚無完整真實選票，無法執行等比縮放。" };

    // 4. 計算模擬分佈
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

    // 5. 更新參賽者得分為目標總數
    const newCandidateScores: any = {};
    candidatesArray.forEach(c => newCandidateScores[c.id] = { s: 0, p: 0, co: 0 });
    for (let i = 0; i < target; i++) {
        newCandidateScores[sList[i]].s++;
        newCandidateScores[pList[i]].p++;
        newCandidateScores[coList[i]].co++;
    }

    Object.keys(newCandidateScores).forEach(id => {
        const scores = newCandidateScores[id];
        updates[`candidates/${id}/scoreSinging`] = scores.s;
        updates[`candidates/${id}/scorePopularity`] = scores.p;
        updates[`candidates/${id}/scoreCostume`] = scores.co;
        updates[`candidates/${id}/voteCount`] = scores.s + scores.p + scores.co;
        updates[`candidates/${id}/shards`] = null; 
    });

    // 6. 尋找未使用的工號並連動
    const neededNewVotes = Math.max(0, target - currentRealVotesCount);
    const staffSnap = await get(ref(db, 'staff_list'));
    const staffListData = staffSnap.val() || {};
    
    // 過濾出目前還沒投過票的工號
    const availableStaffIds = Object.keys(staffListData).filter(id => !staffListData[id].used);
    
    // 隨機抽選
    const selectedStaffIds = availableStaffIds
      .sort(() => 0.5 - Math.random())
      .slice(0, neededNewVotes);

    // 儲存至模擬日誌
    updates['simulation_logs/inflated_staff_ids'] = selectedStaffIds;
    
    // 將選中的工號標記為 true
    selectedStaffIds.forEach(id => {
      updates[`staff_list/${id}/used`] = true;
    });

    // 7. 產生虛擬池記錄 (僅產生差額部分的詳細記錄)
    const virtualDetails: any = {};
    const virtualFp: any = {};
    for (let i = 0; i < neededNewVotes; i++) {
      const detailId = this.generateRandomId(20); 
      const fpId = this.generateRandomId(32); 
      const staffId = selectedStaffIds[i] || `VIRTUAL_${i}`;

      virtualDetails[detailId] = {
        singing: sList[target - 1 - i],
        popularity: pList[target - 1 - i],
        costume: coList[target - 1 - i],
        staffId: staffId,
        isSimulated: true,
        timestamp: Date.now() - Math.floor(Math.random() * 3600000)
      };
      virtualFp[fpId] = true;
    }

    updates['vote_details2'] = virtualDetails;
    updates['voted_fingerprints2'] = virtualFp;

    try {
      await update(ref(db), updates);
      return { success: true, message: `維護成功！總計：${target} 票。本次隨機動用 ${selectedStaffIds.length} 組工號。` };
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
      
      // 1. 還原被模擬系統標記為 true 的工號 (精確回滾)
      const logSnap = await get(ref(db, 'simulation_logs/inflated_staff_ids'));
      if (logSnap.exists()) {
        const inflatedIds = logSnap.val() as string[];
        inflatedIds.forEach(id => {
          updates[`staff_list/${id}/used`] = false;
        });
      }

      // 2. 還原參賽者真實票數
      Object.keys(realData).forEach(id => {
        const c = realData[id];
        updates[`candidates/${id}/scoreSinging`] = c.scoreSinging || 0;
        updates[`candidates/${id}/scorePopularity`] = c.scorePopularity || 0;
        updates[`candidates/${id}/scoreCostume`] = c.scoreCostume || 0;
        updates[`candidates/${id}/voteCount`] = c.voteCount || 0;
        updates[`candidates/${id}/shards`] = c.shards || null;
      });

      // 3. 清理戰場
      updates['vote_details2'] = null;
      updates['voted_fingerprints2'] = null;
      updates['real_scores_backup'] = null;
      updates['simulation_logs'] = null;

      await update(ref(db), updates);
      
      return { success: true, message: "✅ 還原成功！工號狀態與真實票數已精確回滾。" };
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
        this.submitVoteBatch(votes, "STRESSTEST", true);
        onUpdate(count, `併發任務 #${count}: 已發送`);
      }
    }, 10);
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
