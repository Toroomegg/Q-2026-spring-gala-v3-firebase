export interface Candidate {
  id: string;
  name: string;
  song: string;
  image?: string;      // URL to photo
  videoLink?: string;  // URL to video
  
  // Scores
  scoreSinging: number;    // Group A
  scorePopularity: number; // Group B
  scoreCostume: number;    // Group C
  
  // Helpers
  totalScore: number;  // Sum of all (legacy support or grand total)
  voteCount: number;   
  color: string;
}

export enum VoteCategory {
  SINGING = 'SINGING',       // 歌唱
  POPULARITY = 'POPULARITY', // 人氣
  COSTUME = 'COSTUME'        // 造型
}

export interface VoteState {
  hasVoted: boolean; // Simple flag for this device
}

export enum PageView {
  VOTE = 'VOTE',
  RESULTS = 'RESULTS',
  ADMIN = 'ADMIN'
}

// Neon Palette for Dark Mode
export const COLORS = [
  '#ff4d4d', // Neon Red
  '#ffca28', // Neon Amber
  '#00e676', // Neon Green
  '#2979ff', // Neon Blue
  '#d500f9', // Neon Purple
  '#ff4081', // Neon Pink
  '#00bcd4', // Neon Cyan
  '#e040fb', // Neon Fuchsia
];