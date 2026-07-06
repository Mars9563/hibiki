import {
  FaFileWord,
  FaFileExcel,
  FaFileZipper,
  FaFileCsv,
  FaFileLines,
  FaFilePdf,
  FaFile,
} from 'react-icons/fa6';

const MIME_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  'application/pdf': FaFilePdf,
  'application/msword': FaFileWord,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FaFileWord,
  'application/vnd.ms-excel': FaFileExcel,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    FaFileExcel,
  'application/zip': FaFileZipper,
  'text/csv': FaFileCsv,
  'text/plain': FaFileLines,
};

export function getFileIcon(mimeType: string) {
  return MIME_ICON_MAP[mimeType] ?? FaFile;
}
