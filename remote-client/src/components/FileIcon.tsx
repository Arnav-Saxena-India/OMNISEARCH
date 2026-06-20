import React from 'react';
import { 
  FileText, 
  File, 
  FileSpreadsheet, 
  Presentation, 
  Image as ImageIcon 
} from 'lucide-react';

interface FileIconProps {
  filename: string;
  className?: string;
}

export function FileIcon({ filename, className = '' }: FileIconProps) {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  let IconComponent = FileText;
  let colorClass = 'text-gray-500';

  if (extension === 'pdf') {
    IconComponent = FileText;
    colorClass = 'text-red-600';
  } else if (['docx', 'doc'].includes(extension)) {
    IconComponent = FileText;
    colorClass = 'text-blue-600';
  } else if (['xlsx', 'xls', 'csv'].includes(extension)) {
    IconComponent = FileSpreadsheet;
    colorClass = 'text-emerald-600';
  } else if (['pptx', 'ppt'].includes(extension)) {
    IconComponent = Presentation;
    colorClass = 'text-orange-500';
  } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
    IconComponent = ImageIcon;
    colorClass = 'text-indigo-600';
  } else {
    IconComponent = File;
    colorClass = 'text-gray-500';
  }

  return (
    <div className={`flex items-center justify-center ${colorClass} ${className}`}>
      <IconComponent size={24} />
    </div>
  );
}
