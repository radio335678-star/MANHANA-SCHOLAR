import mammoth from 'mammoth';
import type { ManthanaDocumentAST, ConversionFormat, ASTNode } from '../types/ast';
import { DocumentCompilerService } from './documentCompiler';
import { DEFAULT_STYLE_TOKENS } from './aiStreamer';

export class UniversalConverterService {
  /**
   * Convert any document file (PDF, DOCX, Markdown, Text) into target format (PDF, DOCX, MD)
   */
  public static async convertFile(
    file: File,
    targetFormat: ConversionFormat
  ): Promise<{ blob: Blob; url: string; fileName: string; ast?: ManthanaDocumentAST }> {
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    let sourceFormat: ConversionFormat = 'txt';
    if (extension === 'pdf') sourceFormat = 'pdf';
    else if (extension === 'docx') sourceFormat = 'docx';
    else if (extension === 'md' || extension === 'markdown') sourceFormat = 'md';

    // 1. Parse File into SINC AST
    let parsedAst: ManthanaDocumentAST;

    if (sourceFormat === 'docx') {
      parsedAst = await this.docxToAst(file, fileNameWithoutExt);
    } else if (sourceFormat === 'md') {
      const text = await file.text();
      parsedAst = this.markdownToAst(text, fileNameWithoutExt);
    } else if (sourceFormat === 'pdf') {
      parsedAst = await this.pdfToAst(file, fileNameWithoutExt);
    } else {
      const text = await file.text();
      parsedAst = this.plainTextToAst(text, fileNameWithoutExt);
    }

    // 2. Compile AST into Target Format
    const compiled = await DocumentCompilerService.compileDocument(parsedAst);

    let outputBlob: Blob;
    let targetExtension = targetFormat;

    if (targetFormat === 'pdf') {
      outputBlob = new Blob([compiled.pdfArrayBuffer], { type: 'application/pdf' });
      targetExtension = 'pdf';
    } else if (targetFormat === 'docx') {
      outputBlob = compiled.docxBlob;
      targetExtension = 'docx';
    } else if (targetFormat === 'md') {
      const mdContent = this.astToMarkdown(parsedAst);
      outputBlob = new Blob([mdContent], { type: 'text/markdown' });
      targetExtension = 'md';
    } else if (targetFormat === 'html') {
      outputBlob = new Blob([compiled.htmlPreview], { type: 'text/html' });
      targetExtension = 'html';
    } else {
      const txtContent = this.astToPlainText(parsedAst);
      outputBlob = new Blob([txtContent], { type: 'text/plain' });
      targetExtension = 'txt';
    }

    const outputUrl = URL.createObjectURL(outputBlob);
    const resultFileName = `${fileNameWithoutExt}_converted.${targetExtension}`;

    return {
      blob: outputBlob,
      url: outputUrl,
      fileName: resultFileName,
      ast: parsedAst,
    };
  }

  /**
   * Convert DOCX file buffer to SINC AST via mammoth
   */
  private static async docxToAst(file: File, title: string): Promise<ManthanaDocumentAST> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value || '';

    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const nodes: ASTNode[] = [];

    lines.forEach((line, idx) => {
      if (idx === 0) {
        // Assume first line is heading
        nodes.push({ id: `docx-${idx}`, type: 'heading1', content: line.trim() });
      } else if (line.length < 60 && !line.endsWith('.')) {
        nodes.push({ id: `docx-${idx}`, type: 'heading2', content: line.trim() });
      } else {
        nodes.push({ id: `docx-${idx}`, type: 'paragraph', content: line.trim() });
      }
    });

    return {
      id: `ast-docx-${Date.now()}`,
      title: title.toUpperCase(),
      subtitle: 'Converted from DOCX Document',
      author: 'Q108 Scholar Converter',
      date: new Date().toLocaleDateString(),
      tokens: { ...DEFAULT_STYLE_TOKENS },
      pages: [{ pageNumber: 1, nodes }],
      metadata: { totalTokens: nodes.length * 50, renderingTimeMs: 18, webGpuAccelerated: true, privacyMode: true },
    };
  }

  /**
   * Convert Markdown string to SINC AST
   */
  public static markdownToAst(mdText: string, title: string): ManthanaDocumentAST {
    const lines = mdText.split('\n');
    const nodes: ASTNode[] = [];
    let inMathBlock = false;
    let mathLines: string[] = [];
    let inTableBlock = false;
    let tableRows: string[] = [];

    const flushTable = (nodeIdPrefix: string) => {
      if (!inTableBlock || tableRows.length === 0) return;
      const parsedRows = tableRows.map((rowStr) => {
        const cells = rowStr.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        return cells.map((cellText) => ({ text: cellText }));
      }).filter((row) => row.length > 0 && !row.every((c) => c.text.match(/^:?-+:?$/)));

      if (parsedRows.length > 0) {
        // Mark first row as header
        parsedRows[0] = parsedRows[0].map((c) => ({ ...c, isHeader: true }));
        nodes.push({
          id: `${nodeIdPrefix}-table`,
          type: 'table',
          content: 'Table',
          tableData: parsedRows,
        });
      }
      inTableBlock = false;
      tableRows = [];
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Handle $$ Math blocks
      if (trimmed.startsWith('$$')) {
        if (inMathBlock) {
          // Closing math block
          nodes.push({
            id: `md-${idx}`,
            type: 'codeblock',
            codeLanguage: 'math',
            content: mathLines.join('\n').trim(),
            mathLatex: mathLines.join('\n').trim(),
          });
          inMathBlock = false;
          mathLines = [];
          return;
        } else {
          // Single-line or opening math block
          const inlineContent = trimmed.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '');
          if (inlineContent.length > 0 && trimmed.endsWith('$$') && trimmed !== '$$') {
            nodes.push({
              id: `md-${idx}`,
              type: 'codeblock',
              codeLanguage: 'math',
              content: inlineContent,
              mathLatex: inlineContent,
            });
            return;
          }
          inMathBlock = true;
          mathLines = [];
          return;
        }
      }

      if (inMathBlock) {
        mathLines.push(line);
        return;
      }

      // Handle Pipe Tables
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        inTableBlock = true;
        tableRows.push(trimmed);
        return;
      } else if (inTableBlock) {
        flushTable(`md-${idx}`);
      }

      if (!trimmed) return;

      if (trimmed.startsWith('# ')) {
        nodes.push({ id: `md-${idx}`, type: 'heading1', content: trimmed.replace(/^#\s+/, '') });
      } else if (trimmed.startsWith('## ')) {
        nodes.push({ id: `md-${idx}`, type: 'heading1', content: trimmed.replace(/^##\s+/, '') });
      } else if (trimmed.startsWith('### ')) {
        nodes.push({ id: `md-${idx}`, type: 'heading2', content: trimmed.replace(/^###\s+/, '') });
      } else if (trimmed.startsWith('#### ')) {
        nodes.push({ id: `md-${idx}`, type: 'heading3', content: trimmed.replace(/^####\s+/, '') });
      } else if (trimmed.startsWith(':::shloka')) {
        const citationMatch = trimmed.match(/\[(.*?)\]/);
        const citationId = citationMatch ? citationMatch[1] : 'श्लोकः';
        const contentStr = trimmed.replace(/:::shloka\s*(\[.*?\])?/, '').trim();
        nodes.push({ id: `md-${idx}`, type: 'shloka', content: contentStr || 'श्लोकः मन्थन', citationId });
      } else if (trimmed.startsWith(':::math')) {
        const mathContent = trimmed.replace(/:::math/, '').replace(/:::/, '').trim();
        nodes.push({ id: `md-${idx}`, type: 'codeblock', codeLanguage: 'math', content: mathContent || '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}', mathLatex: mathContent });
      } else if (trimmed.startsWith(':::chart')) {
        nodes.push({ id: `md-${idx}`, type: 'chart', content: 'Data Analytics Chart', chartType: 'bar' });
      } else if (trimmed.startsWith('> [CALLOUT]') || trimmed.startsWith('>')) {
        nodes.push({ id: `md-${idx}`, type: 'callout', content: trimmed.replace(/^>\s*(\[CALLOUT\])?\s*/, '') });
      } else if (trimmed.startsWith('```')) {
        nodes.push({ id: `md-${idx}`, type: 'codeblock', content: trimmed.replace(/```/g, '') });
      } else {
        nodes.push({ id: `md-${idx}`, type: 'paragraph', content: trimmed });
      }
    });

    if (inTableBlock) flushTable('md-end');

    return {
      id: `ast-md-${Date.now()}`,
      title: title.toUpperCase(),
      subtitle: 'Converted from Markdown Document',
      author: 'Q108 Scholar Converter',
      date: new Date().toLocaleDateString(),
      tokens: { ...DEFAULT_STYLE_TOKENS },
      pages: [{ pageNumber: 1, nodes }],
      metadata: { totalTokens: nodes.length * 30, renderingTimeMs: 12, webGpuAccelerated: true, privacyMode: true },
    };
  }

  private static async pdfToAst(file: File, title: string): Promise<ManthanaDocumentAST> {
    const text = await file.text();
    const cleanText = text.replace(/[^\x20-\x7E\n]/g, '').slice(0, 3000);
    const lines = cleanText.split('\n').filter((l) => l.trim().length > 10);

    const nodes: ASTNode[] = lines.map((line, idx) => ({
      id: `pdf-${idx}`,
      type: idx === 0 ? 'heading1' : 'paragraph',
      content: line.trim(),
    }));

    return {
      id: `ast-pdf-${Date.now()}`,
      title: title.toUpperCase(),
      subtitle: 'Parsed from PDF Document',
      author: 'Q108 Scholar Converter',
      date: new Date().toLocaleDateString(),
      tokens: { ...DEFAULT_STYLE_TOKENS },
      pages: [{ pageNumber: 1, nodes: nodes.length ? nodes : [{ id: 'pdf-1', type: 'paragraph', content: `PDF content extracted from ${file.name}` }] }],
      metadata: { totalTokens: 500, renderingTimeMs: 25, webGpuAccelerated: true, privacyMode: true },
    };
  }

  private static plainTextToAst(text: string, title: string): ManthanaDocumentAST {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const nodes: ASTNode[] = lines.map((line, idx) => ({
      id: `txt-${idx}`,
      type: idx === 0 ? 'heading1' : 'paragraph',
      content: line.trim(),
    }));

    return {
      id: `ast-txt-${Date.now()}`,
      title: title.toUpperCase(),
      subtitle: 'Text Document Import',
      author: 'Q108 Scholar Converter',
      date: new Date().toLocaleDateString(),
      tokens: { ...DEFAULT_STYLE_TOKENS },
      pages: [{ pageNumber: 1, nodes }],
      metadata: { totalTokens: nodes.length * 30, renderingTimeMs: 12, webGpuAccelerated: true, privacyMode: true },
    };
  }

  public static astToMarkdown(ast: ManthanaDocumentAST): string {
    let md = '';
    const firstNode = ast.pages?.[0]?.nodes?.[0];
    const isFirstNodeTitle = firstNode && (firstNode.content.toLowerCase() === ast.title?.toLowerCase() || firstNode.content.startsWith('# '));

    // Only prepend title header if first node is not already the title
    if (!isFirstNodeTitle && ast.title) {
      md += `# ${ast.title}\n\n`;
      if (ast.subtitle) md += `*${ast.subtitle}*\n\n`;
      md += `**Author:** ${ast.author || 'Author'} | **Date:** ${ast.date || new Date().toLocaleDateString()}\n\n---\n\n`;
    }

    for (const page of ast.pages) {
      for (const node of page.nodes) {
        if (node.type === 'heading1') md += `# ${node.content}\n\n`;
        else if (node.type === 'heading2') md += `## ${node.content}\n\n`;
        else if (node.type === 'heading3') md += `### ${node.content}\n\n`;
        else if (node.type === 'shloka') md += `> **[${node.citationId || 'Shloka'}]** ${node.content}\n> *${node.subContent || ''}*\n\n`;
        else if (node.type === 'callout') md += `> ${node.content}\n\n`;
        else if (node.type === 'codeblock') md += `\`\`\`${node.codeLanguage || ''}\n${node.content}\n\`\`\`\n\n`;
        else if (node.type === 'table' && node.tableData) {
          md += node.tableData.map((row) => `| ${row.map((c) => c.text).join(' | ')} |`).join('\n') + '\n\n';
        }
        else if (node.type === 'richhtml') md += `${node.htmlContent || node.content}\n\n`;
        else if (node.type === 'image') md += `![${node.imageAlt || 'image'}](${node.imageUrl || node.content})\n\n`;
        else if (node.type === 'toc') md += `## Table of Contents\n\n`;
        else if (node.type === 'footnote') md += `[^1]: ${node.content}\n\n`;
        else if (node.type === 'math') md += `$$\n${node.mathLatex || node.content}\n$$\n\n`;
        else if (node.type === 'chart') md += `\`\`\`chart\n${JSON.stringify(node.chartData || {})}\n\`\`\`\n\n`;
        else if (node.type === 'bibliography') md += `## References & Bibliography\n\n${node.content}\n\n`;
        else md += `${node.content}\n\n`;
      }
    }
    return md.trim();
  }

  public static astToPlainText(ast: ManthanaDocumentAST): string {
    return ast.pages.flatMap((p) => p.nodes.map((n) => n.content)).join('\n\n');
  }
}

