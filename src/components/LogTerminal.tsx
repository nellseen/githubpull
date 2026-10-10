import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Copy, Check, Trash2, ArrowDown, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface LogMessage {
  text: string;
  isError?: boolean;
  time?: string;
}

interface LogTerminalProps {
  logs: (string | LogMessage)[];
  title?: string;
  isRunning?: boolean;
  onClear?: () => void;
  status?: 'idle' | 'running' | 'success' | 'error';
}

export const LogTerminal: React.FC<LogTerminalProps> = ({
  logs,
  title = 'Live Execution Console',
  isRunning = false,
  onClear,
  status = 'idle',
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    const raw = logs
      .map((l) => (typeof l === 'string' ? l : l.text))
      .join('\n');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-rose-500/80" />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="h-4 w-px bg-slate-800 mx-1" />
          <Terminal className="h-3.5 w-3.5 text-indigo-400" />
          <span className="font-semibold text-slate-200 tracking-wide">{title}</span>
          {isRunning && (
            <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400 border border-indigo-500/20 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
              STREAMING
            </span>
          )}
          {status === 'success' && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" /> SUCCESS
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400 border border-rose-500/20">
              <ShieldAlert className="h-3 w-3" /> FAILED
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`rounded px-2 py-1 text-[11px] transition-colors ${
              autoScroll ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/60' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Auto-scroll"
          >
            <ArrowDown className={`h-3 w-3 inline mr-1 ${autoScroll ? 'animate-bounce' : ''}`} />
            Scroll
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={logs.length === 0}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40 transition-colors"
            title="Copy logs"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
              title="Clear terminal"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="h-80 overflow-y-auto p-4 space-y-1 select-text">
        {logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-500 text-center">
            <Terminal className="h-8 w-8 mb-2 opacity-30 text-indigo-400" />
            <p>Ready for command execution...</p>
            <p className="text-[11px] text-slate-600 mt-1">Logs will stream here in real time with sanitized credentials</p>
          </div>
        ) : (
          logs.map((log, i) => {
            const isObj = typeof log !== 'string';
            const text = isObj ? log.text : log;
            const isError = isObj ? Boolean(log.isError) : text.toLowerCase().includes('error') || text.toLowerCase().includes('fatal');
            const isSuccess = text.includes('✅') || text.includes('successful') || text.includes('SUKSES') || text.includes('created');
            const isPrompt = text.startsWith('$');

            let textColor = 'text-slate-300';
            if (isError) textColor = 'text-rose-400 font-medium';
            else if (isSuccess) textColor = 'text-emerald-400 font-medium';
            else if (isPrompt) textColor = 'text-sky-300 font-semibold';
            else if (text.startsWith('•') || text.startsWith('Cleaned') || text.startsWith('Flattening')) textColor = 'text-amber-300';

            return (
              <div key={i} className="flex items-start gap-2 leading-relaxed">
                <span className="w-8 shrink-0 select-none text-right text-slate-600">{i + 1}</span>
                <span className={`break-all ${textColor}`}>{text}</span>
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
