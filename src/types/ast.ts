// Manthana Scholar - Unified Document AST & Converter Types

export type FontCategory = 
  | 'geist-sans'
  | 'geist-mono'
  | 'noto-serif-devanagari'
  | 'ibm-plex-serif'
  | 'dm-serif-display'
  | 'playfair-display'
  | 'jetbrains-mono'
  | 'noto-sans'
  | 'inter';

export interface StyleTokens {
  fontFamily: FontCategory;
  // Separate heading sizes
  fontSizeH1: number;    // pt, default 26
  fontSizeH2: number;    // pt, default 18
  fontSizeH3: number;    // pt, default 14
  fontSizeBody: number;  // pt, default 11
  lineHeight: number;    // unitless, e.g. 1.6
  letterSpacing: number; // em, e.g. 0 to 0.1
  paragraphSpacing: number; // em, space-after, e.g. 0.5 to 2.0
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  marginMm: number;         // all-sides margin in mm
  marginTopMm: number;      // per-edge top
  marginBottomMm: number;   // per-edge bottom
  pageSize: 'A4' | 'Letter' | 'A3';
  columns: 1 | 2 | 3;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  pageNumberPosition: 'left' | 'center' | 'right';
  watermarkText?: string;
  watermarkOpacity?: number; // 0-100
  // Keep legacy field for back-compat
  fontSize?: number;
}

export type ASTNodeType = 
  | 'heading1' 
  | 'heading2' 
  | 'heading3' 
  | 'paragraph' 
  | 'shloka' 
  | 'callout' 
  | 'codeblock' 
  | 'table' 
  | 'divider'
  | 'key_value_grid'
  | 'richhtml'
  | 'image'
  | 'toc'
  | 'footnote'
  | 'math'         // LaTeX math equation
  | 'chart'        // interactive SVG chart
  | 'bibliography';// auto Bibliography

export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  highlight?: string;
  link?: string;
  superscript?: boolean;
  subscript?: boolean;
  fontSize?: number;
}

export interface TableCell {
  text: string;
  isHeader?: boolean;
}

export interface CitationItem {
  id: string;
  author: string;
  year: number;
  title: string;
  publisher?: string;
}

export interface ASTNode {
  id: string;
  type: ASTNodeType;
  content: string;
  // Source tracking — distinguishes E2B sandbox, AI text, and user content
  sourceType?: 'user' | 'ai_text' | 'e2b_python' | 'e2b_typst';
  richContent?: RichSpan[];
  subContent?: string;
  tableData?: TableCell[][];
  codeLanguage?: string;
  citationId?: string;
  imageUrl?: string;
  imageAlt?: string;
  htmlContent?: string;
  mathLatex?: string;        // LaTeX formula
  chartType?: 'bar' | 'line' | 'pie' | 'doughnut';
  chartData?: { labels: string[]; datasets: { label: string; data: number[] }[] };
  diffStatus?: 'proposed' | 'accepted' | 'rejected'; // Track changes
  originalContent?: string;  // Original text before AI rewrite
  citations?: CitationItem[]; // References list
  customStyle?: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    align?: 'left' | 'center' | 'right' | 'justify';
  };
}

export interface SincPage {
  pageNumber: number;
  nodes: ASTNode[];
}

export interface ManthanaDocumentAST {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  tokens: StyleTokens;
  pages: SincPage[];
  metadata: {
    totalTokens: number;
    renderingTimeMs: number;
    webGpuAccelerated: boolean;
    privacyMode: boolean;
  };
}

export interface ASTDelta {
  type: 'set_meta' | 'append_node' | 'update_node' | 'update_tokens';
  pageIndex: number;
  node?: ASTNode;
  tokens?: Partial<StyleTokens>;
  meta?: Partial<ManthanaDocumentAST['metadata']>;
}

export type ConversionFormat = 'pdf' | 'docx' | 'md' | 'txt' | 'html';

export interface ConversionTask {
  sourceFormat: ConversionFormat;
  targetFormat: ConversionFormat;
  fileName: string;
  resultBlob?: Blob;
  resultUrl?: string;
  status: 'idle' | 'converting' | 'success' | 'error';
  errorMsg?: string;
}
