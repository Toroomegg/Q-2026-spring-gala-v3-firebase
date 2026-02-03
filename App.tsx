
// Removed unused GoogleGenAI import
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { Candidate, VoteCategory } from './types';
import { voteService } from './services/voteService';
import { generateLiveCommentary } from './services/geminiService';
import Fireworks from './components/Fireworks';

// --- Shared Components ---

const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  e.currentTarget.src = "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80";
};

const ConfirmModal: React.FC<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    isDangerous?: boolean;
    showCancel?: boolean;
}> = ({ isOpen, title, message, onConfirm, onCancel, isDangerous, showCancel = true }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e293b] border border-slate-600 p-6 rounded-2xl max-w-sm w-full shadow-2xl animate-scale-up text-white">
                <h3 className={`text-xl font-bold mb-2 ${isDangerous ? 'text-red-500' : 'text-white'}`}>{title}</h3>
                <p className="text-slate-300 mb-6 whitespace-pre-wrap text-sm leading-relaxed">{message}</p>
                <div className="flex gap-3 justify-end">
                    {showCancel && (
                        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">取消</button>
                    )}
                    <button onClick={onConfirm} className={`px-4 py-2 rounded-lg font-bold transition-all active:scale-95 ${isDangerous ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>確定</button>
                </div>
            </div>
        </div>
    );
};

const StaffIdModal: React.FC<{
    isOpen: boolean;
    onConfirm: (staffId: string) => Promise<{ success: boolean; message?: string }>;
    onCancel: () => void;
    isSubmitting: boolean;
}> = ({ isOpen, onConfirm, onCancel, isSubmitting }) => {
    const [staffId, setStaffId] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setStaffId('');
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        const trimmed = staffId.trim();
        if (!trimmed) {
            setError('請輸入工號');
            return;
        }
        if (trimmed !== "16888" && trimmed.length !== 8) {
            setError('請輸入 8 碼工號或萬用碼');
            return;
        }
        setError('');
        const res = await onConfirm(trimmed);
        if (res && !res.success) {
            setError(res.message || '驗證失敗');
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="glass-panel p-8 rounded-[2rem] max-w-sm w-full border-2 border-yellow-500/30 shadow-[0_0_50px_rgba(234,179,8,0.3)] animate-scale-up">
                <h3 className="text-2xl font-black text-white text-center mb-2">身分驗證</h3>
                <p className="text-slate-400 text-center text-sm mb-6">請輸入 8 碼員工工號以完成投票</p>
                
                <div className="mb-6">
                    <input 
                        type="text" 
                        value={staffId}
                        onChange={(e) => setStaffId(e.target.value.trim())}
                        placeholder="請輸入 8 碼工號"
                        className="w-full bg-slate-900/50 border-2 border-slate-700 rounded-2xl px-6 py-4 text-center text-2xl font-black tracking-[0.3em] text-yellow-400 focus:border-yellow-500 outline-none transition-all placeholder:text-slate-700 placeholder:tracking-normal"
                        maxLength={8}
                    />
                    {error && <p className="text-red-500 text-center text-xs mt-2 font-bold animate-pulse">{error}</p>}
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting}
                        className={`w-full py-4 rounded-2xl font-black text-xl transition-all shadow-lg active:scale-95 ${isSubmitting ? 'bg-slate-700 text-slate-500' : 'bg-gradient-to-r from-yellow-500 to-orange-600 text-white'}`}
                    >
                        {isSubmitting ? '正在驗證中...' : '確定送出'}
                    </button>
                    <button onClick={onCancel} className="w-full py-3 text-slate-500 font-bold hover:text-slate-300 transition-colors">取消</button>
                </div>
            </div>
        </div>
    );
};

const CandidateDetailModal: React.FC<{
    candidate: Candidate | null;
    categoryTitle: string;
    onClose: () => void;
    onSelect: (id: string) => void;
    isSelected: boolean;
    canVote: boolean;
}> = ({ candidate, categoryTitle, onClose, onSelect, isSelected, canVote }) => {
    if (!candidate) return null;
    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border-2 border-slate-700 rounded-[2.5rem] max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
                <div className="relative h-72">
                    <img 
                        src={candidate.image || "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80"} 
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                        loading="lazy"
                        decoding="async"
                    />
                    <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full text-white flex items-center justify-center border border-white/20 hover:bg-black/70 transition-all">✕</button>
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-900 to-transparent p-6">
                        <span className="bg-yellow-600 text-white px-3 py-1 rounded-full text-[10px] font-bold mb-2 inline-block uppercase tracking-wider">{categoryTitle}</span>
                        <h3 className="text-3xl font-black text-white">{candidate.name}</h3>
                    </div>
                </div>
                <div className="p-6">
                    <div className="mb-6">
                        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">演唱歌曲</p>
                        <p className="text-xl text-yellow-400 font-bold">🎵 {candidate.song}</p>
                    </div>
                    {canVote ? (
                        <button 
                            onClick={() => { onSelect(candidate.id); onClose(); }}
                            className={`w-full py-4 rounded-2xl font-black text-xl transition-all shadow-lg active:scale-95 ${isSelected ? 'bg-green-600 text-white cursor-default' : 'bg-gradient-to-r from-yellow-500 to-red-600 text-white'}`}
                        >
                            {isSelected ? '✓ 已選擇此參賽者' : '選擇此位參賽者'}
                        </button>
                    ) : (
                        <div className="bg-slate-800 text-slate-500 py-4 rounded-2xl font-black text-center text-lg border border-slate-700">
                            投票通道尚未開啟
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Header: React.FC<{ subtitle?: string; size?: 'small' | 'large' }> = ({ subtitle, size = 'large' }) => (
  <header className="text-center relative z-10 py-2 md:py-4 select-none animate-fade-in-down w-full">
    <div className={`flex justify-center ${size === 'large' ? 'mb-8' : 'mb-2'} relative group`}>
        <div className="absolute inset-0 bg-yellow-500 blur-3xl opacity-20 rounded-full group-hover:opacity-30 transition-opacity"></div>
        <img 
            src="https://storage.googleapis.com/example-eggy-addressable/DownloadFile/2026Slogan.png" 
            alt="Spring Gala Logo" 
            onError={handleImageError}
            loading="eager"
            decoding="async"
            className={`${size === 'large' ? 'h-40 md:h-56' : 'h-16 md:h-24'} object-contain drop-shadow-[0_0_25px_rgba(234,179,8,0.5)] relative z-10`}
        />
    </div>
    <div className="inline-block relative px-4">
      <div className="absolute inset-0 bg-red-600 blur-2xl opacity-30 rounded-full animate-pulse"></div>
      <h1 className={`font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-300 to-yellow-600 ${size === 'large' ? 'text-3xl md:text-5xl' : 'text-xl md:text-3xl'} tracking-wider leading-tight text-glow`}>
        2026 廣達BU1,BU11,BU15<br className="md:hidden"/>尾牙晚宴
      </h1>
    </div>
    {subtitle && <p className="text-yellow-100/90 mt-1 font-bold tracking-[0.2em] uppercase text-xs md:text-sm drop-shadow-md">&mdash; {subtitle} &mdash;</p>}
  </header>
);

const SpotlightItem: React.FC<{ candidate?: Candidate; rank: 1 | 2 | 3 | string; score: number; title: string }> = ({ candidate, rank, score, title }) => {
    if (!candidate) return <div className="text-center p-20 opacity-30 animate-pulse text-4xl font-black">等待揭曉中...</div>;
    
    let badgeEmoji = "👑";

    if (rank === 2) { badgeEmoji = "🥈"; }
    else if (rank === 3) { badgeEmoji = "🥉"; }

    return (
        <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto py-4 animate-scale-up relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] md:w-[500px] md:h-[500px] rounded-full border-2 border-dashed border-white/10 animate-spin-slow opacity-20"></div>
            
            <div className="relative z-10 text-center mb-4">
                <span className={`text-3xl md:text-5xl block mb-1 drop-shadow-lg`}>{badgeEmoji}</span>
                <h2 className="text-xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-yellow-200 to-white uppercase tracking-[0.3em]">{title}</h2>
            </div>

            <div className="relative z-20 mb-6">
                <div className={`rounded-full overflow-hidden border-8 border-slate-800 bg-slate-900 w-40 h-40 md:w-64 md:h-64 shadow-[0_0_80px_rgba(255,255,255,0.1)] relative transition-transform duration-700 hover:scale-105`}>
                     <img src={candidate.image || "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80"} className="w-full h-full object-cover" onError={handleImageError} loading="eager" decoding="async" />
                     <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                </div>
                <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 border-4 border-slate-700 px-6 py-1 rounded-full shadow-2xl z-30 flex items-center gap-3`}>
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Score</span>
                    <span className="text-2xl md:text-4xl font-black font-mono text-yellow-400">{score}</span>
                </div>
            </div>

            <div className="text-center z-30 animate-fade-in-up delay-200">
                <h3 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter drop-shadow-2xl">{candidate.name}</h3>
                <p className="text-lg md:text-2xl text-yellow-100/80 font-bold italic">🎵 {candidate.song}</p>
            </div>
        </div>
    );
};

// --- Pages ---

const GamePage: React.FC = () => {
    const [candidates, setCandidates] = useState<Candidate[]>(voteService.getCandidates());

    useEffect(() => {
        voteService.startPolling();
        const unsub = voteService.subscribe(() => setCandidates(voteService.getCandidates()));
        return () => unsub();
    }, []);

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-transparent relative">
            <Fireworks />
            
            <style>
                {`
                @keyframes marquee-infinite-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee-infinite {
                    display: flex;
                    width: max-content;
                    animation: marquee-infinite-scroll 60s linear infinite;
                    will-change: transform;
                }
                `}
            </style>
            
            <div className="flex-1 flex flex-col items-center justify-start p-2 md:p-4 relative z-10 overflow-hidden">
                <div className="h-[15vh] w-full flex items-center justify-center mb-4 animate-fade-in-down">
                    <img 
                        src="https://storage.googleapis.com/example-eggy-addressable/DownloadFile/2026Slogan.png" 
                        alt="Tail Logo" 
                        className="h-full max-w-full object-contain drop-shadow-[0_0_50px_rgba(234,179,8,0.7)]"
                        onError={handleImageError}
                        loading="eager"
                        decoding="async"
                    />
                </div>

                <div className="w-full max-w-4xl glass-panel rounded-[3rem] p-8 md:p-12 border-2 border-yellow-500/30 shadow-[0_0_80px_rgba(234,179,8,0.1)]">
                    <div className="text-center mb-10">
                        <h2 className="text-3xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-100 via-yellow-400 to-yellow-600 tracking-tighter mb-4">🎤 互動小遊戲：接唱挑戰賽</h2>
                        <div className="h-1.5 w-48 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mx-auto"></div>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="space-y-8 w-full max-w-2xl">
                            <h3 className="text-2xl md:text-3xl font-black text-yellow-500 border-l-8 border-yellow-500 pl-6 mb-6">📜 遊戲規則</h3>
                            <ul className="space-y-8 text-xl md:text-3xl font-bold text-white/90 leading-relaxed">
                                <li className="flex items-start gap-4">
                                    <span className="text-yellow-500 shrink-0 mt-2">●</span>
                                    <span>主持人抽出一位 <span className="text-yellow-400 underline decoration-4 underline-offset-8">主桌主管</span></span>
                                </li>
                                <li className="flex items-start gap-4">
                                    <span className="text-yellow-500 shrink-0 mt-2">●</span>
                                    <span>主持人唱前二句，主管接唱 <span className="text-yellow-400">(至少二句)</span></span>
                                </li>
                                <li className="flex items-start gap-4">
                                    <span className="text-yellow-500 shrink-0 mt-2">●</span>
                                    <span>挑戰失敗，<span className="text-red-500 font-black">捐贈獎金 3000 元</span></span>
                                </li>
                                <li className="flex items-start gap-4">
                                    <span className="text-yellow-500 shrink-0 mt-2">●</span>
                                    <span>主管可挑同仁接唱，成功者獲該獎金！</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-6 w-full flex-none"></div>

            <div className="h-40 bg-slate-900/70 backdrop-blur-2xl border-t border-white/10 flex items-center relative z-20 overflow-hidden">
                <div className="absolute top-0 left-0 h-full w-20 bg-gradient-to-r from-slate-950 to-transparent z-30 pointer-events-none"></div>
                <div className="absolute top-0 right-0 h-full w-20 bg-gradient-to-l from-slate-950 to-transparent z-30 pointer-events-none"></div>
                
                <div className="animate-marquee-infinite whitespace-nowrap">
                    {candidates.length > 0 ? (
                        candidates.concat(candidates).map((c, idx) => (
                            <div key={`${c.id}-${idx}`} className="inline-flex items-center gap-6 px-12 group transition-all">
                                <div className="w-16 h-16 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-slate-700 shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:border-yellow-500 transition-all">
                                    <img src={c.image || ""} className="w-full h-full object-cover" onError={handleImageError} loading="lazy" decoding="async" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-white font-black text-xl md:text-3xl tracking-tight">{c.name}</span>
                                    <span className="text-yellow-500 font-bold text-xs md:text-xl mt-0.5">🎵 {c.song}</span>
                                </div>
                                <div className="mx-8 text-slate-800 text-6xl font-thin select-none">/</div>
                            </div>
                        ))
                    ) : (
                        <div className="text-slate-600 font-black text-2xl px-40">Loading Stars...</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const VotePage: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selections, setSelections] = useState<{[key in VoteCategory]: string | null}>({
      [VoteCategory.SINGING]: null,
      [VoteCategory.POPULARITY]: null,
      [VoteCategory.COSTUME]: null
  });
  const [hasVoted, setHasVoted] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGlobalTestMode, setIsGlobalTestMode] = useState(false);
  const [isVotingOpen, setIsVotingOpen] = useState(true);
  const [useStaffVerification, setUseStaffVerification] = useState(true);
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const [isStaffIdModalOpen, setIsStaffIdModalOpen] = useState(false);
  
  const [detailModal, setDetailModal] = useState<{ candidate: Candidate | null, category: VoteCategory | null, categoryTitle: string } | null>(null);

  const sectionRefs = {
      [VoteCategory.SINGING]: useRef<HTMLDivElement>(null),
      [VoteCategory.POPULARITY]: useRef<HTMLDivElement>(null),
      [VoteCategory.COSTUME]: useRef<HTMLDivElement>(null)
  };

  useEffect(() => {
    voteService.startPolling();
    const sync = () => {
      setCandidates(voteService.getCandidates());
      setHasVoted(voteService.hasVoted());
      setIsGlobalTestMode(voteService.isGlobalTestMode);
      setIsVotingOpen(voteService.isVotingOpen);
      setUseStaffVerification(voteService.useStaffVerification);
    };
    sync();
    const unsub = voteService.subscribe(sync);
    return () => {
      voteService.stopPolling();
      unsub();
    };
  }, []);

  const handleSelect = (category: VoteCategory, candidateId: string) => {
      if (!isVotingOpen) return;
      if (hasVoted && !isGlobalTestMode) return;
      setSelections(prev => ({ ...prev, [category]: candidateId }));
  };

  const isAllSelected = selections.SINGING && selections.POPULARITY && selections.COSTUME;

  const getCandidateName = (id: string | null) => {
    if (!id) return "未選擇";
    return candidates.find(c => c.id === id)?.name || "未知";
  };

  const scrollToCategory = (cat: VoteCategory) => {
      const ref = sectionRefs[cat];
      if (ref && ref.current) {
          const yOffset = -100;
          const y = ref.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
          window.scrollTo({ top: y, behavior: 'smooth' });
      }
  };

  const handleSubmitAll = () => {
      if (!isAllSelected) return;
      setIsConfirmingSubmit(true);
  };

  const executeSubmit = async (staffId: string) => {
      setIsSubmitting(true);
      const result = await voteService.submitVoteBatch(selections as any, staffId);
      if (result.success) {
          setIsStaffIdModalOpen(false);
          setJustVoted(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setIsSubmitting(false);
      return result;
  };

  if (justVoted || (hasVoted && !isGlobalTestMode)) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center px-4 relative z-10 bg-transparent">
              <Fireworks />
              <div className="glass-panel p-10 rounded-3xl text-center max-w-md border border-green-500/50 shadow-2xl animate-scale-up">
                  <div className="text-7xl mb-6">✅</div>
                  <h1 className="text-3xl font-black text-white mb-4">投票成功！</h1>
                  <p className="text-slate-300 text-lg mb-8">感謝您的參與，祝您中大獎！</p>
                  {isGlobalTestMode && (
                      <button 
                        onClick={() => { setJustVoted(false); setSelections({SINGING:null, POPULARITY:null, COSTUME:null}); }}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-full text-sm font-bold transition-all active:scale-95 shadow-lg"
                      >
                        返回投票 (測試模式)
                      </button>
                  )}
              </div>
          </div>
      );
  }

  const SECTIONS = [
      { cat: VoteCategory.SINGING, title: "Group A: 金嗓歌王獎", sub: "唱功最厲害", color: "border-yellow-500/30", icon: "🎤" },
      { cat: VoteCategory.POPULARITY, title: "Group B: 最佳人氣獎", sub: "氣氛最嗨", color: "border-pink-500/30", icon: "💖" },
      { cat: VoteCategory.COSTUME, title: "Group C: 最佳造型獎", sub: "造型最用心", color: "border-purple-500/30", icon: "🎭" }
  ];

  return (
    <div className="min-h-screen pb-64 px-2 md:px-4 relative z-10 pt-4 bg-transparent">
      <Header subtitle={isVotingOpen ? "歌唱大賽評分系統" : "參賽名單預覽"} size="small" />
      
      {!isVotingOpen && (
          <div className="max-w-xl mx-auto mb-6 animate-pulse">
              <div className="bg-amber-500/20 border border-amber-500/50 p-4 rounded-2xl flex items-center justify-center gap-3">
                  <span className="text-2xl">⏳</span>
                  <p className="text-amber-200 font-black text-lg">投票通道尚未開啟，請等候大螢幕指令</p>
              </div>
          </div>
      )}

      <ConfirmModal 
          isOpen={isConfirmingSubmit} 
          title="最後確認" 
          message={`確認提交以下選擇嗎？\n\n🎤 金嗓歌王：${getCandidateName(selections.SINGING)}\n💖 最佳人氣：${getCandidateName(selections.POPULARITY)}\n🎭 最佳造型：${getCandidateName(selections.COSTUME)}\n\n送出後將無法更改選票！${useStaffVerification ? '\n\n(下一步將進行工號驗證)' : ''}`} 
          onConfirm={() => { 
              setIsConfirmingSubmit(false); 
              if (useStaffVerification) {
                  setIsStaffIdModalOpen(true);
              } else {
                  executeSubmit("anonymous");
              }
          }} 
          onCancel={() => setIsConfirmingSubmit(false)} 
      />

      <StaffIdModal 
          isOpen={isStaffIdModalOpen}
          onConfirm={executeSubmit}
          onCancel={() => {
              setIsStaffIdModalOpen(false);
              setSelections({
                  [VoteCategory.SINGING]: null,
                  [VoteCategory.POPULARITY]: null,
                  [VoteCategory.COSTUME]: null
              });
          }}
          isSubmitting={isSubmitting}
      />

      <CandidateDetailModal 
          candidate={detailModal?.candidate || null}
          categoryTitle={detailModal?.categoryTitle || ""}
          onClose={() => setDetailModal(null)}
          onSelect={(id) => handleSelect(detailModal!.category!, id)}
          isSelected={detailModal ? selections[detailModal.category!] === detailModal.candidate?.id : false}
          canVote={isVotingOpen}
      />

      <div className="max-w-4xl mx-auto space-y-4">
          {SECTIONS.map(section => (
            <div key={section.cat} ref={sectionRefs[section.cat]} className={`p-4 rounded-[2rem] border-2 ${section.color} bg-slate-900/60 backdrop-blur-md scroll-mt-24 shadow-xl`}>
                <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{section.icon}</span>
                        <div>
                            <h2 className="text-base font-black text-white leading-tight">{section.title}</h2>
                            <p className="text-slate-500 text-[9px] uppercase font-bold tracking-widest">{section.sub}</p>
                        </div>
                    </div>
                    {isVotingOpen ? (
                        selections[section.cat] ? (
                            <div className="bg-green-600/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full text-[9px] font-black animate-pulse">✓ 已選</div>
                        ) : (
                            <div className="bg-slate-800 text-slate-500 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black uppercase">待選</div>
                        )
                    ) : (
                        <div className="bg-slate-800/40 text-slate-400 border border-slate-700/50 px-3 py-1 rounded-full text-[9px] font-black uppercase">預覽中</div>
                    )}
                </div>

                <div className="grid grid-cols-5 gap-y-4 gap-x-1">
                    {candidates.map((c, idx) => {
                        const isSelected = selections[section.cat] === c.id;
                        return (
                            <div 
                                key={c.id} 
                                onClick={() => setDetailModal({ candidate: c, category: section.cat, categoryTitle: section.title })}
                                className={`flex flex-col items-center cursor-pointer group ${!isVotingOpen ? 'animate-float' : ''}`}
                                style={{ animationDelay: `${idx * 0.1}s` }}
                            >
                                <div className={`relative w-12 h-12 md:w-16 md:h-16 rounded-full transition-all duration-300 ${isSelected ? 'scale-110' : 'hover:scale-110'}`}>
                                    <div className={`w-full h-full rounded-full overflow-hidden border-2 ${isSelected ? 'border-green-500 ring-4 ring-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-slate-700 bg-slate-800 group-hover:border-yellow-500'} shadow-inner`}>
                                        <img 
                                            src={c.image || "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80"} 
                                            className="w-full h-full object-cover" 
                                            onError={handleImageError}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div>
                                    {isVotingOpen && isSelected && (
                                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-[9px] shadow-lg border-2 border-slate-900">✓</div>
                                    )}
                                </div>
                                <span className={`text-[9px] md:text-xs mt-1.5 truncate w-full text-center px-1 font-black ${isSelected ? 'text-green-400' : 'text-slate-400'}`}>
                                    {c.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
          ))}
      </div>
      
      <div className="fixed bottom-0 left-0 w-full bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 p-4 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <div className="max-w-xl mx-auto mb-4">
              <div className="grid grid-cols-3 gap-2">
                  {SECTIONS.map(s => (
                      <div 
                        key={s.cat}
                        onClick={() => scrollToCategory(s.cat)}
                        className={`p-2 rounded-xl text-center border cursor-pointer transition-all ${selections[s.cat] ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-slate-800 bg-slate-900/50 opacity-60'}`}>
                          <div className="text-[9px] text-slate-500 font-black mb-0.5 uppercase tracking-tighter">{s.icon} {s.cat === VoteCategory.SINGING ? '金嗓' : s.cat === VoteCategory.POPULARITY ? '人氣' : '造型'}</div>
                          <div className="text-[11px] font-black text-white truncate">{getCandidateName(selections[s.cat])}</div>
                      </div>
                  ))}
              </div>
          </div>
          
          {isVotingOpen ? (
              <button 
                  onClick={handleSubmitAll} 
                  disabled={!isAllSelected || isSubmitting} 
                  className={`w-full max-w-xl mx-auto block py-4 rounded-2xl font-black text-xl transition-all shadow-2xl ${isAllSelected ? 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-600 text-white active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
              {isSubmitting ? '正在驗證身分...' : (isAllSelected ? '確認送出三項評分' : '請完成所有組別選擇')}
          </button>
          ) : (
              <div className="w-full max-w-xl mx-auto bg-slate-800 text-slate-400 py-4 rounded-2xl font-black text-center text-xl border border-slate-700 opacity-80">
                  請點擊頭像瀏覽參賽者
              </div>
          )}
      </div>
    </div>
  );
};

// --- Results Page (Kanban) ---

enum ResultStep {
    COSTUME = 'COSTUME',
    POPULARITY = 'POPULARITY',
    SINGING_3RD = 'SINGING_3RD',
    SINGING_2ND = 'SINGING_2ND',
    SINGING_1ST = 'SINGING_1ST'
}

const ResultsPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPreview, setShowPreview] = useState(true); 
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [commentary, setCommentary] = useState<string>("AI 正在分析戰況...");
  const [activeStep, setActiveStep] = useState<ResultStep>(ResultStep.COSTUME);
  const [confirmStep, setConfirmStep] = useState<{isOpen: boolean, target: ResultStep | null}>({isOpen: false, target: null});
  const [errorModal, setErrorModal] = useState({ isOpen: false, msg: '' });

  const lastUpdateRef = useRef<{ leaderId: string, totalVotes: number, timestamp: number }>({
      leaderId: '',
      totalVotes: 0,
      timestamp: 0
  });
  
  useEffect(() => {
    if (!isAuthenticated) return;
    voteService.startPolling();
    const updateData = () => setCandidates(voteService.getCandidates());
    updateData();
    const unsub = voteService.subscribe(updateData);

    const commentInterval = setInterval(async () => {
        const currentCandidates = voteService.getCandidates();
        if (currentCandidates.length === 0) return;

        const totalVotes = currentCandidates.reduce((sum, c) => sum + c.voteCount, 0);
        const sorted = [...currentCandidates].sort((a, b) => b.scoreSinging - a.scoreSinging);
        const currentLeader = sorted[0];
        const now = Date.now();

        const shouldUpdate = 
            currentLeader?.id !== lastUpdateRef.current.leaderId ||
            totalVotes >= lastUpdateRef.current.totalVotes * 1.1 ||
            (now - lastUpdateRef.current.timestamp) > 60000;

        if (shouldUpdate) {
            setCommentary(await generateLiveCommentary(currentCandidates));
            lastUpdateRef.current = {
                leaderId: currentLeader?.id || '',
                totalVotes: totalVotes,
                timestamp: now
            };
        }
    }, 10000); 

    return () => { voteService.stopPolling(); unsub(); clearInterval(commentInterval); };
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin888') {
      setIsAuthenticated(true);
    } else {
      setErrorModal({ isOpen: true, msg: '登入失敗：密碼錯誤，請重新確認！' });
    }
  };

  const STEPS_CONFIG: { step: ResultStep; label: string; icon: string; cat: VoteCategory; rank: 1 | 2 | 3 }[] = [
      { step: ResultStep.COSTUME, label: "最佳造型", icon: "🎭", cat: VoteCategory.COSTUME, rank: 1 },
      { step: ResultStep.POPULARITY, label: "最佳人氣", icon: "💖", cat: VoteCategory.POPULARITY, rank: 1 },
      { step: ResultStep.SINGING_3RD, label: "金嗓第三", icon: "🥉", cat: VoteCategory.SINGING, rank: 3 },
      { step: ResultStep.SINGING_2ND, label: "金嗓第二", icon: "🥈", cat: VoteCategory.SINGING, rank: 2 },
      { step: ResultStep.SINGING_1ST, label: "金嗓歌王", icon: "🥇", cat: VoteCategory.SINGING, rank: 1 }
  ];

  const getCurrentWinner = () => {
      const config = STEPS_CONFIG.find(s => s.step === activeStep);
      if (!config || candidates.length === 0) return null;
      
      const sorted = [...candidates].sort((a, b) => {
          if (config.cat === VoteCategory.SINGING) return b.scoreSinging - a.scoreSinging;
          if (config.cat === VoteCategory.POPULARITY) return b.scorePopularity - a.scorePopularity;
          return b.scoreCostume - a.scoreCostume;
      });

      return {
          candidate: sorted[config.rank - 1],
          score: config.cat === VoteCategory.SINGING ? sorted[config.rank - 1]?.scoreSinging : 
                 config.cat === VoteCategory.POPULARITY ? sorted[config.rank - 1]?.scorePopularity : 
                 sorted[config.rank - 1]?.scoreCostume,
          rank: config.rank,
          title: config.label
      };
  };

  const current = getCurrentWinner();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
        <ConfirmModal isOpen={errorModal.isOpen} title="登入錯誤" message={errorModal.msg} onConfirm={() => setErrorModal({isOpen:false, msg:''})} showCancel={false} isDangerous />
        <form onSubmit={handleLogin} className="glass-panel p-8 rounded-2xl w-full max-w-md border border-slate-700">
          <h2 className="text-2xl font-bold text-center mb-6 text-white">開票控制台登入</h2>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 mb-6 text-white focus:border-yellow-500 outline-none" placeholder="請輸入管理密碼" />
          <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-lg transition-colors shadow-lg active:scale-95">揭曉排名</button>
        </form>
      </div>
    );
  }

  if (showPreview) {
    return (
      <div className="min-h-screen bg-transparent text-white relative pb-32 flex flex-col items-center">
        <Fireworks />
        <div className="relative z-10 px-4 py-6 w-full max-w-7xl h-full flex flex-col items-center">
            <Header subtitle="總決賽參賽名單" />
            
            <div className="flex-1 w-full flex items-center justify-center py-4">
              <div className="grid grid-cols-5 gap-x-12 gap-y-12 w-full max-w-[95vw]">
                {candidates.slice(0, 10).map((c, i) => (
                  <div key={c.id} className="flex flex-col items-center animate-scale-up" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="w-24 h-24 md:w-36 md:h-36 rounded-full overflow-hidden border-4 border-slate-700 shadow-2xl mb-4 group hover:border-yellow-500 transition-all duration-300">
                      <img src={c.image || ""} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onError={handleImageError} loading="lazy" decoding="async" />
                    </div>
                    <div className="text-center w-full px-1">
                      <h3 className="text-base md:text-xl font-black text-white mb-1 drop-shadow-lg leading-tight break-words">
                        {c.name}
                      </h3>
                      <p className="text-yellow-500 font-bold text-[10px] md:text-sm italic leading-tight break-words">🎵 {c.song}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pb-12">
              <button 
                onClick={() => setShowPreview(false)}
                className="bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 hover:from-yellow-500 hover:to-red-500 text-white font-black text-3xl px-20 py-6 rounded-full shadow-[0_0_50px_rgba(234,179,8,0.5)] transition-all hover:scale-110 active:scale-95 animate-pulse"
              >
                開始開獎
              </button>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white relative pb-32 overflow-hidden flex flex-col items-center">
      <Fireworks />
      <ConfirmModal isOpen={confirmStep.isOpen} title="切換環節" message={`確定揭曉下一階段嗎？`} onConfirm={() => { if (confirmStep.target) setActiveStep(confirmStep.target); setConfirmStep({isOpen: false, target: null}); }} onCancel={() => setConfirmStep({isOpen: false, target: null})} />
      
      <div className="relative z-10 px-4 py-2 w-full max-w-7xl h-full flex flex-col">
        <Header size="small" subtitle="即時戰況揭曉" />
        
        <div className="flex flex-wrap justify-center gap-2 mb-4 sticky top-2 z-[100]">
            <button 
                onClick={() => setShowPreview(true)} 
                className="px-3 py-1.5 rounded-xl font-bold text-xs md:text-sm transition-all border-2 bg-slate-900/80 backdrop-blur text-slate-300 border-slate-700 hover:border-yellow-500 flex items-center gap-2"
            >
                <span>📋</span>
                <span>名單總覽</span>
            </button>
            {STEPS_CONFIG.map(s => (
                <button key={s.step} onClick={() => { if (s.step !== activeStep) setConfirmStep({ isOpen: true, target: s.step }); }} className={`px-3 py-1.5 rounded-xl font-bold text-xs md:text-sm transition-all border-2 flex items-center gap-2 ${activeStep === s.step ? 'bg-yellow-600 text-white border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]' : 'bg-slate-900/80 backdrop-blur text-slate-500 border-slate-800'}`}>
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                </button>
            ))}
        </div>

        <div className="flex-1 flex items-center justify-center overflow-hidden">
            {current && <SpotlightItem candidate={current.candidate} rank={current.rank} score={current.score || 0} title={current.title} />}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-slate-900/90 backdrop-blur-md border-t-2 border-yellow-500 z-50 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-4">
            <div className="shrink-0 w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center text-xl animate-bounce">🤖</div>
            <p className="text-sm md:text-xl font-black text-yellow-50 truncate italic tracking-tight">{commentary}</p>
        </div>
      </div>
    </div>
  );
};

// --- Backup Page (Manual Mode) ---

const BackupPage: React.FC = () => {
    const [password, setPassword] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [isConfigured, setIsConfigured] = useState(false);
    const [activeStep, setActiveStep] = useState<ResultStep>(ResultStep.COSTUME);
    
    const [manualResults, setManualResults] = useState<{ [key in ResultStep]: { id: string, score: number } }>({
        [ResultStep.COSTUME]: { id: '', score: 0 },
        [ResultStep.POPULARITY]: { id: '', score: 0 },
        [ResultStep.SINGING_3RD]: { id: '', score: 0 },
        [ResultStep.SINGING_2ND]: { id: '', score: 0 },
        [ResultStep.SINGING_1ST]: { id: '', score: 0 }
    });

    useEffect(() => {
        voteService.startPolling();
        const update = () => setCandidates(voteService.getCandidates());
        update(); 
        const unsub = voteService.subscribe(update);
        return () => unsub();
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === 'admin888') {
            setIsAuthenticated(true);
            setLoginError('');
        } else {
            setLoginError('密碼錯誤，請重新輸入');
        }
    };

    const updateManual = (step: ResultStep, field: 'id' | 'score', value: string | number) => {
        setManualResults(prev => ({
            ...prev,
            [step]: { ...prev[step], [field]: value }
        }));
    };

    const STEPS_CONFIG: { step: ResultStep; label: string; icon: string; rank: 1 | 2 | 3 }[] = [
        { step: ResultStep.COSTUME, label: "最佳造型", icon: "🎭", rank: 1 },
        { step: ResultStep.POPULARITY, label: "最佳人氣", icon: "💖", rank: 1 },
        { step: ResultStep.SINGING_3RD, label: "金嗓第三", icon: "🥉", rank: 3 },
        { step: ResultStep.SINGING_2ND, label: "金嗓第二", icon: "🥈", rank: 2 },
        { step: ResultStep.SINGING_1ST, label: "金嗓歌王", icon: "🥇", rank: 1 }
    ];

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
                <form onSubmit={handleLogin} className="glass-panel p-8 rounded-2xl w-full max-w-md border border-slate-700">
                    <h2 className="text-2xl font-bold text-center mb-6 text-white">手動模式登入驗證</h2>
                    {loginError && <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm mb-4 text-center">{loginError}</div>}
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 mb-6 text-white focus:border-orange-500 outline-none" placeholder="請輸入管理密碼" />
                    <button type="submit" className="w-full bg-orange-700 hover:bg-orange-600 text-white font-bold py-4 rounded-lg shadow-lg active:scale-95 transition-all">進入手動設定</button>
                </form>
            </div>
        );
    }

    if (!isConfigured) {
        return (
            <div className="min-h-screen bg-transparent text-white p-4 md:p-6 overflow-hidden">
                <div className="max-w-4xl mx-auto h-full flex flex-col">
                    <h1 className="text-2xl font-black mb-4 text-orange-500 border-b border-orange-500/30 pb-2">手動排名模式 (適配 1080p)</h1>
                    
                    <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                        {STEPS_CONFIG.map(config => (
                            <div key={config.step} className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row gap-4 items-center">
                                <div className="shrink-0 flex items-center gap-2 w-32">
                                    <span className="text-2xl">{config.icon}</span>
                                    <span className="font-black text-sm">{config.label}</span>
                                </div>
                                
                                <select 
                                    value={manualResults[config.step].id} 
                                    onChange={(e) => updateManual(config.step, 'id', e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2 text-white focus:border-orange-500 outline-none w-full font-bold text-sm"
                                >
                                    <option value="">選擇獲獎者...</option>
                                    {candidates.map(c => <option key={c.id} value={c.id}>{c.name} - {c.song}</option>)}
                                </select>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">分：</span>
                                    <input 
                                        type="number" 
                                        value={manualResults[config.step].score}
                                        onChange={(e) => updateManual(config.step, 'score', parseInt(e.target.value) || 0)}
                                        className="w-20 bg-slate-900 border border-slate-700 rounded-xl p-2 text-center font-mono font-bold text-orange-400 text-sm"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 flex justify-center pb-4">
                        <button 
                            onClick={() => setIsConfigured(true)}
                            className="bg-orange-700 hover:bg-orange-600 text-white font-black py-3 px-12 rounded-xl text-lg shadow-lg transition-all active:scale-95"
                        >
                            確認並開啟聚光燈開獎頁
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const currentConfig = STEPS_CONFIG.find(s => s.step === activeStep);
    const manualData = manualResults[activeStep];
    const candidate = candidates.find(c => c.id === manualData.id);

    return (
        <div className="min-h-screen bg-transparent text-white relative pb-32 overflow-hidden flex flex-col items-center">
            <Fireworks />
            <div className="relative z-10 px-4 py-2 w-full max-w-7xl h-full flex flex-col">
                <Header size="small" subtitle="手動模式系統 (適配 1080p)" />
                
                <div className="flex flex-wrap justify-center gap-2 mb-4 sticky top-2 z-[100]">
                    {STEPS_CONFIG.map(s => (
                        <button key={s.step} onClick={() => setActiveStep(s.step)} className={`px-3 py-1.5 rounded-xl font-bold text-xs md:text-sm transition-all border-2 flex items-center gap-2 ${activeStep === s.step ? 'bg-orange-700 text-white border-orange-400 shadow-[0_0_15px_rgba(255,165,0,0.4)]' : 'bg-slate-900/80 backdrop-blur text-slate-500 border-slate-800'}`}>
                            <span>{s.icon}</span>
                            <span>{s.label}</span>
                        </button>
                    ))}
                    <button onClick={() => setIsConfigured(false)} className="px-3 py-1.5 rounded-xl font-bold text-xs bg-red-900/50 border-2 border-red-500/50 text-red-200">重設</button>
                </div>

                <div className="flex-1 flex items-center justify-center overflow-hidden">
                    {candidate ? (
                        <SpotlightItem candidate={candidate} rank={currentConfig?.rank || 1} score={manualData.score} title={currentConfig?.label || ""} />
                    ) : (
                        <div className="text-center p-20 opacity-30 text-4xl font-black">此環節未設定獲獎者</div>
                    )}
                </div>
            </div>
            
            <div className="fixed bottom-0 left-0 w-full bg-orange-900/90 backdrop-blur-md border-t-2 border-orange-500 z-50 py-3 shadow-2xl">
                <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-4 italic font-black text-xs md:text-lg text-white uppercase tracking-tighter">
                    ⚠️ MANUAL MODE ACTIVE - 手動揭曉模式 ⚠️
                </div>
            </div>
        </div>
    );
};

// --- Admin Page ---

const AdminPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stressCount, setStressCount] = useState(0);
  const [stressLogs, setStressLogs] = useState<string[]>([]);
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [globalTestMode, setGlobalTestMode] = useState(false);
  const [isVotingOpen, setIsVotingOpen] = useState(true);
  const [useStaffVerification, setUseStaffVerification] = useState(true);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [simulationTarget, setSimulationTarget] = useState<number>(900);
  const [useGroupedScaling, setUseGroupedScaling] = useState(false); 
  const [isScaling, setIsScaling] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [staffIdCsv, setStaffIdCsv] = useState('');
  const [apiModal, setApiModal] = useState({ isOpen: false, msg: '' });
  const [loginErrorModal, setLoginErrorModal] = useState({ isOpen: false, msg: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, isDangerous: false });

  // Staff Stats
  const [masterKeyCount, setMasterKeyCount] = useState(0);
  const [authorizedStaffCount, setAuthorizedStaffCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    voteService.startPolling();
    const update = () => {
        setCandidates(voteService.getCandidates());
        setIsStressTesting(voteService.isRunningStressTest);
        setGlobalTestMode(voteService.isGlobalTestMode);
        setIsVotingOpen(voteService.isVotingOpen);
        setUseStaffVerification(voteService.useStaffVerification);
        setMasterKeyCount(voteService.masterKeyCount);
        setAuthorizedStaffCount(voteService.authorizedStaffCount);
    };
    update();
    const unsub = voteService.subscribe(update);
    return () => { voteService.stopPolling(); unsub(); };
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin888') {
      setIsAuthenticated(true);
    } else {
      setLoginErrorModal({ isOpen: true, msg: '登入密碼錯誤，請確認您的權限！' });
    }
  };

  const handleTestApi = async () => {
      if (isTestingApi) return;
      setIsTestingApi(true);
      try {
          const res = await voteService.testConnection(); 
          setApiModal({ isOpen: true, msg: res.message }); 
      } finally {
          setIsTestingApi(false);
      }
  };

  const handleSyncSheet = async () => {
      if (isSyncingSheet) return;
      setIsSyncingSheet(true);
      try {
          const res = await voteService.syncCandidatesFromGoogleSheet();
          setApiModal({ isOpen: true, msg: res.message });
      } finally {
          setIsSyncingSheet(false);
      }
  };

  const handleManualSync = async () => {
      if (!csvContent.trim()) {
          setApiModal({ isOpen: true, msg: "請先在下方文本框貼入 CSV 內容。" });
          return;
      }
      setIsSyncingSheet(true);
      try {
          const res = await voteService.syncCandidatesFromText(csvContent);
          setApiModal({ isOpen: true, msg: res.message });
          setCsvContent(''); 
      } finally {
          setIsSyncingSheet(false);
      }
  };

  const handleStaffIdUpload = async () => {
      if (!staffIdCsv.trim()) {
          setApiModal({ isOpen: true, msg: "請先貼入 8 碼工號名單。" });
          return;
      }
      setIsSyncingSheet(true);
      try {
          const res = await voteService.uploadStaffIds(staffIdCsv);
          setApiModal({ isOpen: true, msg: res.message });
          setStaffIdCsv('');
      } finally {
          setIsSyncingSheet(false);
      }
  };

  const handlePurgeStaff = async () => {
    setIsSyncingSheet(true);
    try {
        const res = await voteService.purgeStaffVerification();
        setApiModal({ isOpen: true, msg: res.message });
    } finally {
        setIsSyncingSheet(false);
    }
  };

  const handleScaleSimulation = async () => {
      if (isScaling) return;
      setIsScaling(true);
      try {
          const res = await voteService.scaleVotesProportionally(simulationTarget, useGroupedScaling);
          setApiModal({ isOpen: true, msg: res.message });
      } finally {
          setIsScaling(false);
      }
  };

  const handleRestoreRealData = async () => {
      if (isScaling) return;
      setIsScaling(true);
      try {
          const res = await voteService.restoreRealVotes();
          setApiModal({ isOpen: true, msg: res.message });
      } finally {
          setIsScaling(false);
      }
  };

  const totalSinging = candidates.reduce((sum, c) => sum + (c.scoreSinging || 0), 0);
  const totalPopularity = candidates.reduce((sum, c) => sum + (c.scorePopularity || 0), 0);
  const totalCostume = candidates.reduce((sum, c) => sum + (c.scoreCostume || 0), 0);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
        <ConfirmModal isOpen={loginErrorModal.isOpen} title="登入錯誤" message={loginErrorModal.msg} onConfirm={() => setLoginErrorModal({isOpen:false, msg:''})} showCancel={false} isDangerous />
        <form onSubmit={handleLogin} className="glass-panel p-8 rounded-2xl w-full max-w-md border border-slate-700">
          <h2 className="text-2xl font-bold text-center mb-6 text-white">系統管理後台</h2>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 mb-6 text-white focus:border-blue-500 outline-none" placeholder="請輸入管理密碼" />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg shadow-lg active:scale-95 transition-all">進入控制台</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-10 text-white font-sans overflow-x-hidden pb-32">
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(prev => ({...prev, isOpen: false}))} isDangerous={confirmModal.isDangerous} />
      <ConfirmModal isOpen={apiModal.isOpen} title="操作結果" message={apiModal.msg} onConfirm={() => setApiModal({isOpen:false, msg:''})} showCancel={false} />
      
      {isStressTesting && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
              <div className="bg-[#1e293b] border border-slate-600 p-6 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col h-[80vh]">
                  <h3 className="text-2xl font-black mb-4 text-yellow-400 flex justify-between items-center">
                      <span>🚀 壓力測試 (Queueing)</span>
                      <span className="text-white text-lg font-mono">{stressCount} / 900</span>
                  </h3>
                  <div className="flex-1 bg-black/50 p-4 font-mono text-[10px] md:text-xs text-green-400 overflow-y-auto rounded-lg border border-slate-700 custom-scrollbar">
                      {stressLogs.map((log, i) => <div key={i} className="mb-1 border-b border-white/5 pb-1">{log}</div>)}
                      {stressLogs.length === 0 && <div className="text-slate-500 italic">正在初始化任務...</div>}
                  </div>
                  <button onClick={() => voteService.stopStressTest()} className="mt-6 w-full py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-all active:scale-95 shadow-lg">立即停止測試</button>
              </div>
          </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
            <h1 className="text-3xl md:text-4xl font-black">⚙️ 系統管理後台</h1>
            <div className="flex gap-3">
                <button onClick={() => voteService.clearMyHistory()} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm border border-slate-600 transition-colors">清除本機投票紀錄</button>
                <button onClick={() => setIsAuthenticated(false)} className="bg-red-600 hover:bg-red-500 px-6 py-2 rounded-lg font-bold shadow-md transition-colors">登出</button>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-10 animate-fade-in-up">
            <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">🎤 金嗓總票數</div>
                <div className="text-3xl font-black text-yellow-500 font-mono">{totalSinging}</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">💖 人氣總票數</div>
                <div className="text-3xl font-black text-pink-500 font-mono">{totalPopularity}</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">🎭 造型總票數</div>
                <div className="text-3xl font-black text-purple-500 font-mono">{totalCostume}</div>
            </div>
            <div className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg">
                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">📊 預估參與人數</div>
                <div className="text-3xl font-black text-white font-mono">{Math.max(totalSinging, totalPopularity, totalCostume)}</div>
            </div>
            <div className="bg-yellow-600/20 border border-yellow-500/30 p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg">
                <div className="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-1">🔑 16888 萬用碼</div>
                <div className="text-3xl font-black text-yellow-100 font-mono">{masterKeyCount}</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">🆔 已導入工號</div>
                <div className="text-3xl font-black text-slate-100 font-mono">{authorizedStaffCount}</div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-8">
                {/* --- 身分驗證管理 --- */}
                <div className="bg-[#1e293b]/60 backdrop-blur-xl border border-slate-700 p-6 rounded-3xl shadow-xl border-l-4 border-yellow-500">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">🆔 工號名單管理</h2>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${useStaffVerification ? 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30' : 'bg-slate-700/50 text-slate-500 border-slate-600/50'}`}>
                            {useStaffVerification ? '驗證模式：ON' : '驗證模式：OFF'}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 space-y-3">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">貼入 8 碼工號 (一行一個)</p>
                            <textarea 
                                value={staffIdCsv}
                                onChange={e => setStaffIdCsv(e.target.value)}
                                placeholder="12345678&#10;87654321&#10;..."
                                className="w-full h-32 bg-black/30 border border-slate-700 rounded-xl p-3 text-[10px] font-mono focus:border-yellow-500 outline-none"
                            ></textarea>
                            <button onClick={handleStaffIdUpload} disabled={isSyncingSheet} className="w-full bg-yellow-600 hover:bg-yellow-500 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md">
                                {isSyncingSheet ? '上傳中...' : '✅ 導入工號名單'}
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <button onClick={() => setConfirmModal({isOpen: true, title: '重置狀態', message: '確定重置所有工號的投票狀態嗎？', isDangerous: true, onConfirm: async () => { setConfirmModal(p => ({...p, isOpen: false})); const res = await voteService.resetStaffVotingStatus(); setApiModal({isOpen: true, msg: res.message}); }})} className="w-full bg-slate-800 hover:bg-slate-700 p-4 rounded-xl text-center text-sm font-bold border border-slate-600 transition-colors">
                                🔄 重置所有工號投票狀態
                            </button>
                            <button onClick={() => setConfirmModal({isOpen: true, title: '⚠️ 移除工號驗證', message: '確定移除工號驗證並清空名單嗎？\n\n執行後：\n1. 徹底清空雲端名單資料\n2. 前台將不再跳出工號輸入框\n3. 投票將變為「全開放模式」\n\n(原本投過的指紋與模擬數據會保留)', isDangerous: true, onConfirm: async () => { setConfirmModal(p => ({...p, isOpen: false})); handlePurgeStaff(); }})} className="w-full bg-red-900/20 hover:bg-red-900/40 border border-red-500/50 text-red-400 p-4 rounded-xl text-center text-sm font-bold transition-all shadow-inner">
                                ⚠️ 移除工號驗證並清空名單
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-[#1e293b]/60 backdrop-blur-xl border border-slate-700 p-6 rounded-3xl shadow-xl border-l-4 border-purple-500">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">🎮 活動模式與通道</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${isVotingOpen ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                <span className={`font-black text-lg ${isVotingOpen ? 'text-green-400' : 'text-slate-400'}`}>{isVotingOpen ? '通道：開啟' : '通道：關閉'}</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={isVotingOpen} onChange={() => voteService.setVotingStatus(!isVotingOpen)} />
                                <div className="w-14 h-7 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                            <div className="flex items-center gap-3">
                                <span className="text-lg">🏆</span>
                                <span className={`font-black text-lg ${globalTestMode ? 'text-orange-400' : 'text-blue-400'}`}>{globalTestMode ? '模式：測試' : '模式：正式'}</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={globalTestMode} onChange={() => voteService.setGlobalTestMode(!globalTestMode)} />
                                <div className="w-14 h-7 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="bg-[#1e293b]/60 backdrop-blur-xl border border-slate-700 p-6 rounded-3xl shadow-xl border-l-4 border-red-500">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">🚀 壓力測試 (Queue)</h2>
                    <button onClick={() => setConfirmModal({isOpen: true, title: '壓力測試', message: '模擬 900 人同時投票，透過背景隊列消化。確定開始？', isDangerous: true, onConfirm: () => { setConfirmModal(p => ({...p, isOpen: false})); setStressLogs([]); voteService.runStressTest(900, (c, l) => { setStressCount(c); setStressLogs(prev => [l, ...prev].slice(0, 50)); }); }})} className="w-full bg-red-900/30 hover:bg-red-800/50 border border-red-500 text-red-200 py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-md">
                        開始 900 人模擬投票 (背景 Queue)
                    </button>
                </div>

                <div className="bg-[#1e293b]/60 backdrop-blur-xl border border-slate-700 p-6 rounded-3xl shadow-xl border-l-4 border-blue-500">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">🛠️ 參賽者維護</h2>
                        <span className="bg-blue-600/30 text-blue-400 px-3 py-1 rounded-full text-xs font-black border border-blue-500/30">目前參與：{totalSinging} 人</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <button onClick={handleSyncSheet} disabled={isSyncingSheet} className="bg-slate-800 hover:bg-slate-700 p-4 rounded-xl text-center text-sm font-bold border border-slate-600 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                            {isSyncingSheet ? '⏳ 同步中...' : '📡 自動同步 Google Sheets'}
                        </button>
                        
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 space-y-3">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">手動貼上參賽者 CSV</p>
                            <textarea 
                                value={csvContent}
                                onChange={e => setCsvContent(e.target.value)}
                                placeholder="ID,Name,Song,Image,Video..."
                                className="w-full h-32 bg-black/30 border border-slate-700 rounded-xl p-3 text-[10px] font-mono focus:border-blue-500 outline-none"
                            ></textarea>
                            <button onClick={handleManualSync} disabled={isSyncingSheet} className="w-full bg-blue-700 hover:bg-blue-600 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                {isSyncingSheet ? '同步中...' : '✅ 貼上完成，開始同步'}
                            </button>
                        </div>

                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 space-y-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">後台投票維護區</p>
                            
                            <label className="flex items-center gap-3 cursor-pointer group bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-all">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={useGroupedScaling} 
                                        onChange={e => setUseGroupedScaling(e.target.checked)} 
                                    />
                                    <div className="w-6 h-6 border-2 border-slate-600 rounded-lg peer-checked:bg-yellow-600 peer-checked:border-yellow-500 transition-all flex items-center justify-center">
                                        <span className={`text-white text-xs ${useGroupedScaling ? 'opacity-100' : 'opacity-0'}`}>✓</span>
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black text-slate-200">啟用投票維護</span>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">你知、我知、獨眼龍也知</span>
                                </div>
                            </label>

                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    value={simulationTarget} 
                                    onChange={e => setSimulationTarget(parseInt(e.target.value) || 0)}
                                    placeholder="目標人數"
                                    className="flex-1 bg-black/30 border border-slate-700 rounded-xl px-4 py-2 text-yellow-500 font-black outline-none focus:border-yellow-500"
                                />
                                <button 
                                    onClick={() => setConfirmModal({isOpen: true, title: '維護啟用', message: `即將按照維護原則於 ${simulationTarget} 票，並使用 ${useGroupedScaling ? '「模式2」' : '「模式2」'} 模式。確定執行？`, isDangerous: false, onConfirm: () => { setConfirmModal(p => ({...p, isOpen: false})); handleScaleSimulation(); }})}
                                    disabled={isScaling}
                                    className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50"
                                >
                                    啟用
                                </button>
                            </div>
                            <button 
                                onClick={handleRestoreRealData}
                                disabled={isScaling}
                                className="w-full bg-slate-700 hover:bg-slate-600 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                            >
                                ⏪ 復原投票系統
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={handleTestApi} disabled={isTestingApi} className="bg-slate-800 hover:bg-slate-700 p-4 rounded-xl text-center text-sm font-bold border border-slate-600 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                                {isTestingApi ? '測試中...' : '📡 測試連線'}
                            </button>
                            <button onClick={() => setConfirmModal({isOpen: true, title: '危險操作', message: '清空雲端所有參賽者的得票紀錄，歸零後無法還原！', isDangerous: true, onConfirm: async () => { setConfirmModal(p => ({...p, isOpen: false})); await voteService.resetAllRemoteVotes(); }})} className="bg-red-900/20 hover:bg-red-900/40 border border-red-500/50 text-red-500 p-4 rounded-xl text-center text-sm font-bold transition-all">歸零分數</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-7 bg-[#1e293b]/60 backdrop-blur-xl border border-slate-700 p-6 md:p-8 rounded-3xl shadow-xl border-l-4 border-yellow-500">
                <h2 className="text-2xl font-bold mb-6">🎤 參賽者清單 (現有 {candidates.length} 位)</h2>
                
                <div className="space-y-4 max-h-[1000px] overflow-y-auto pr-2 custom-scrollbar">
                    {candidates.map(c => (
                        <div key={c.id} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl flex items-center justify-between group">
                            <div className="flex items-center gap-4 truncate">
                                <div className="w-14 h-14 rounded-full bg-slate-700 overflow-hidden shrink-0 border-2 border-slate-600">
                                    {c.image ? <img src={c.image} className="w-full h-full object-cover" loading="lazy" decoding="async" /> : <div className="w-full h-full flex items-center justify-center">👤</div>}
                                </div>
                                <div className="truncate">
                                    <div className="font-bold text-lg truncate group-hover:text-yellow-400 transition-colors">{c.name}</div>
                                    <div className="text-xs text-slate-400 truncate">{c.song}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex gap-4 text-right hidden md:flex">
                                    <div className="flex flex-col items-center">
                                        <div className="text-[9px] text-slate-500 font-bold uppercase">金嗓</div>
                                        <div className="text-sm font-mono font-black text-yellow-500">{c.scoreSinging}</div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <div className="text-[9px] text-slate-500 font-bold uppercase">人氣</div>
                                        <div className="text-sm font-mono font-black text-pink-500">{c.scorePopularity}</div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <div className="text-[9px] text-slate-500 font-bold uppercase">造型</div>
                                        <div className="text-sm font-mono font-black text-purple-500">{c.scoreCostume}</div>
                                    </div>
                                </div>
                                <button onClick={() => setConfirmModal({isOpen: true, title: '刪除參賽者', message: `確定移除 "${c.name}"？`, isDangerous: true, onConfirm: async () => { setConfirmModal(p => ({...p, isOpen: false})); await voteService.deleteCandidate(c.id); }})} className="text-slate-500 hover:text-red-500 p-2">✕</button>
                            </div>
                        </div>
                    ))}
                    {candidates.length === 0 && <div className="text-center py-20 text-slate-500 italic">尚未同步名單，請使用上方同步功能。</div>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const DevNav: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    if (!isOpen) return <button onClick={() => setIsOpen(true)} className="fixed bottom-6 right-6 z-[120] w-14 h-14 bg-slate-800/90 backdrop-blur text-white rounded-full border border-slate-600 shadow-2xl flex items-center justify-center text-2xl opacity-70 hover:opacity-100 hover:scale-110 transition-all">⚙️</button>;
    return (
        <div className="fixed bottom-6 right-6 z-[120] bg-[#1e293b]/95 backdrop-blur-xl border border-slate-600 p-4 rounded-3xl flex flex-col gap-3 shadow-2xl animate-scale-up min-w-[160px]">
            <div className="flex justify-between items-center px-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">系統導覽</span>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <Link to="/" onClick={() => setIsOpen(false)} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold text-white text-center">🗳️ 前台投票</Link>
            <Link to="/results" onClick={() => setIsOpen(false)} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold text-white text-center">📊 開票看板</Link>
            <Link to="/game" onClick={() => setIsOpen(false)} className="px-4 py-3 bg-purple-700 hover:bg-purple-600 rounded-xl text-sm font-bold text-white text-center">🎮 互動遊戲</Link>
            <Link to="/backup" onClick={() => setIsOpen(false)} className="px-4 py-3 bg-orange-700 hover:bg-orange-600 rounded-xl text-sm font-bold text-white text-center">🆘 (手動模式)</Link>
            <Link to="/admin" onClick={() => setIsOpen(false)} className="px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold text-white text-center shadow-lg">⚙️ 後台管理</Link>
        </div>
    );
};

const App: React.FC = () => (
    <HashRouter>
      <Routes>
        <Route path="/" element={<VotePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/game" element={<GamePage />} />
      </Routes>
      <DevNav />
    </HashRouter>
);

export default App;
