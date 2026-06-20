import React from 'react';
import { FileIcon } from './FileIcon';
import { Download } from 'lucide-react';

interface SearchResultCardProps {
  filename: string;
  score: number;
  uri: string;
  content: string;
  searchQuery: string;
}

function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed break-words">{text}</p>;
  }

  // Escape special regex characters to avoid errors
  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  
  const parts = text.split(regex);

  return (
    <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed break-words">
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="bg-yellow-500/30 text-yellow-200 px-1 rounded font-semibold">
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </p>
  );
}

export function SearchResultCard({ filename, score, uri, content, searchQuery }: SearchResultCardProps) {
  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 rounded-xl shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          <FileIcon filename={filename} className="flex-shrink-0" />
          <h3 className="font-medium text-slate-100 truncate" title={filename}>
            {filename}
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
            {(score * 100).toFixed(0)}% Match
          </span>
          <a
            href={uri}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
            title="Download"
          >
            <Download size={18} />
          </a>
        </div>
      </div>
      <div className="pl-9">
        <HighlightedSnippet text={content} query={searchQuery} />
      </div>
    </div>
  );
}
