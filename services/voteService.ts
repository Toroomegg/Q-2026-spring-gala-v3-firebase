
import { ref, onValue, runTransaction, set, update, remove, Unsubscribe, get } from "firebase/database";
import { db } from "./firebase";
import { Candidate, COLORS, VoteCategory } from '../types';

const STORAGE_KEY_HAS_VOTED = 'spring_gala_has_voted_v2';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1bgo64Fv3OjzCZvokiOhYnqYhj_FaXtnZBRJiYd55Foo/export?format=csv&gid=282478112';

class VoteService {
  private listeners: Array<() => void> = [];
  private candidates: Candidate[] = [];
  private dbUnsubscribe: Unsubscribe | null = null;
  
  public isGlobalTestMode = false;
  public isVotingOpen = true; 
  public isRunningStressTest = false;

  constructor() {}

  getCandidates(): Candidate[] { return this.candidates; }
  hasVoted(): boolean { return !!localStorage.getItem(STORAGE_KEY_HAS_VOTED); }

  startPolling() {
    if (this.dbUnsubscribe) return;
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

  stopPolling() {
    if (this.dbUnsubscribe) { this.dbUnsubscribe(); this.dbUnsubscribe = null; }
  }

  // --- 解析 CSV 核心邏輯 ---
  private async processCSVLines(lines: string[]): Promise<{ count: number, message: string }> {
    const rows = lines.slice(1); // 跳過第一行標題
    let count = 0;
    
    for (let row of rows) {
      if (!row.trim()) continue;
      // 根據使用者提供的 CSV：0:id, 1:name, 2:song, 3:image, 4:videoLink
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => col.trim().replace(/^"|"$/g, ''));
      
      if (columns.length < 3) continue;
      
      const id = columns[0];
      const val1 = columns[1];
      const val2 = columns[2];
      const image = columns[3] || "";
      const video = columns[4] || "";

      // 處理系統狀態列
      if (id === "VOTING_STATUS") {
        await this.setVotingStatus(val1 === "OPEN");
        continue;
      }
      if (id === "SETTING_MODE") {
        await this.setGlobalTestMode(val1 === "TEST");
        continue;
      }

      // 處理參賽者資料
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

  // 自動同步 (從連結抓取)
  async syncCandidatesFromGoogleSheet(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(SHEET_CSV_URL);
      if (!response.ok) throw new Error("Google Sheet 連結讀取失敗。這通常是 CORS 攔截導致。請嘗試「手動貼上 CSV」功能。");
      const csvText = await response.text();
      const res = await this.processCSVLines(csvText.split(/\r?\n/));
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, message: `自動同步失敗: ${e.message}` };
    }
  }

  // 手動同步 (直接傳入 CSV 字串)
  async syncCandidatesFromText(csvText: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.processCSVLines(csvText.split(/\r?\n/));
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, message: `手動同步失敗: ${e.message}` };
    }
  }

  // --- 其他投票邏輯維持不變 ---
  async submitVoteBatch(votes: { [key in VoteCategory]: string }, isStressTest = false): Promise<{ success: boolean; message?: string }> {
    if (!isStressTest && !this.isVotingOpen) return { success: false, message: "投票通道已關閉。" };
    if (!isStressTest && !this.isGlobalTestMode && this.hasVoted()) return { success: false, message: "您已經參與過投票囉！" };
    const categories = [VoteCategory.SINGING, VoteCategory.POPULARITY, VoteCategory.COSTUME];
    try {
      const promises = categories.map(async (cat) => {
        const candidateId = votes[cat];
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
      if (!this.isGlobalTestMode && !isStressTest) { localStorage.setItem(STORAGE_KEY_HAS_VOTED, 'true'); this.notifyListeners(); }
      return { success: true };
    } catch (e: any) { return { success: false, message: "連線異常。" }; }
  }

  async addCandidate(c: any) {
    const candidateRef = ref(db, `candidates/${c.id}`);
    await set(candidateRef, { name: c.name, song: c.song, image: c.image || "", scoreSinging: 0, scorePopularity: 0, scoreCostume: 0, voteCount: 0 });
  }
  async deleteCandidate(id: string) { const candidateRef = ref(db, `candidates/${id}`); await remove(candidateRef); }
  async resetAllRemoteVotes() {
    const updates: any = {};
    this.candidates.forEach(c => {
      updates[`candidates/${c.id}/scoreSinging`] = 0;
      updates[`candidates/${c.id}/scorePopularity`] = 0;
      updates[`candidates/${c.id}/scoreCostume`] = 0;
      updates[`candidates/${c.id}/voteCount`] = 0;
    });
    await update(ref(db, '/'), updates);
  }
  async setGlobalTestMode(enabled: boolean) { await update(ref(db, 'settings'), { isGlobalTestMode: enabled }); }
  async setVotingStatus(isOpen: boolean) { await update(ref(db, 'settings'), { isVotingOpen: isOpen }); }
  async testConnection() { return { ok: true, message: "Firebase 連線正常。" }; }
  async runStressTest(totalUsers: number, onProgress: (count: number, log: string) => void) {
    this.isRunningStressTest = true; this.notifyListeners();
    for (let i = 0; i < totalUsers; i++) {
      if (!this.isRunningStressTest) break;
      const cA = this.candidates[Math.floor(Math.random() * this.candidates.length)];
      if (!cA) break;
      await this.submitVoteBatch({ [VoteCategory.SINGING]: cA.id, [VoteCategory.POPULARITY]: cA.id, [VoteCategory.COSTUME]: cA.id }, true);
      onProgress(i + 1, `模擬用戶 #${i + 1} 已寫入`);
    }
    this.isRunningStressTest = false; this.notifyListeners();
  }
  stopStressTest() { this.isRunningStressTest = false; this.notifyListeners(); }
  subscribe(callback: () => void) { this.listeners.push(callback); return () => { this.listeners = this.listeners.filter(l => l !== callback); }; }
  private notifyListeners() { this.listeners.forEach(l => l()); }
  clearMyHistory() { localStorage.removeItem(STORAGE_KEY_HAS_VOTED); this.notifyListeners(); }
  getFormUrl() { return "#"; }
}

export const voteService = new VoteService();
