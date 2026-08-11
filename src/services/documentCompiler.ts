import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document as DocxDocument, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType } from 'docx';
import type { ManthanaDocumentAST } from '../types/ast';
import { DEFAULT_STYLE_TOKENS } from './aiStreamer';

export interface CompilationOutput {
  pdfArrayBuffer: ArrayBuffer;
  pdfBlobUrl: string;
  docxBlob: Blob;
  docxBlobUrl: string;
  htmlPreview: string;
  compilationTimeMs: number;
  pdfSizeBytes: number;
  docxSizeBytes: number;
  totalPages: number;
}


export class DocumentCompilerService {
  /**
   * Layer 1: Sanitize WinAnsi encoding to prevent pdf-lib crash on non-ASCII characters
   */
  public static sanitizeWinAnsiText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-') // Normalize dashes & hyphens
      .replace(/[\u2018\u2019]/g, "'")                        // Normalize single quotes
      .replace(/[\u201C\u201D]/g, '"')                        // Normalize double quotes
      .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')      // Normalize bullets
      .replace(/\u00A0/g, ' ')                                // Normalize non-breaking space
      .replace(/[^\x00-\xFF]/g, '?');                         // Replace unmappable WinAnsi chars with '?'
  }

  /**
   * Strip raw markdown syntax (*, **, ***, _, __, `) for clean PDF rendering
   */
  public static stripMarkdownFormatting(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/^>\s*/, '')
      .replace(/^#+\s*/, '')
      .replace(/\\/g, '');
  }

  /**
   * Layer 2: Safe text drawing wrapper that catches pdf-lib drawing warnings
   */
  private static safeDrawText(page: any, text: string, options: any) {
    try {
      const stripped = this.stripMarkdownFormatting(text);
      const cleanText = this.sanitizeWinAnsiText(stripped);
      page.drawText(cleanText, options);
    } catch (err) {
      console.warn("PDF drawText prevented crash:", err);
    }
  }


  /**
   * Compile Manthana AST into both PDF binary (pdf-lib) and DOCX binary (docx.js) inside browser memory
   */
  public static async compileDocument(ast: ManthanaDocumentAST): Promise<CompilationOutput> {
    const startTime = performance.now();

    // 1. Compile PDF via pdf-lib with Layer 3 Defensive Exception Boundary
    const pdfDoc = await PDFDocument.create();
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

    const tokens = { ...DEFAULT_STYLE_TOKENS, ...(ast?.tokens || {}) };
    const primaryRgb = this.hexToRgb(tokens.primaryColor || '#60a5fa');

    const textRgb = rgb(0.1, 0.1, 0.1);
    const mutedRgb = rgb(0.5, 0.5, 0.5);

    let pageCount = 1;

    try {
      // Gather all nodes across all AST pages
      const allNodes = ast.pages.flatMap((p) => p.nodes);

      let page = pdfDoc.addPage([595.28, 841.89]); // Page 1

      let { width, height } = page.getSize();
      let currentY = height - 50;

      const drawHeaderAndTitle = (isFirstPage: boolean) => {
        if (tokens.headerText) {
          this.safeDrawText(page, tokens.headerText, {
            x: 40,
            y: height - 30,
            size: 8,
            font: fontHelvetica,
            color: primaryRgb,
          });
          page.drawLine({
            start: { x: 40, y: height - 36 },
            end: { x: width - 40, y: height - 36 },
            thickness: 0.5,
            color: primaryRgb,
          });
        }

        if (isFirstPage) {
          this.safeDrawText(page, ast.title || 'Untitled Document', {
            x: 40,
            y: currentY - 15,
            size: 16,
            font: fontHelveticaBold,
            color: primaryRgb,
          });
          currentY -= 35;

          if (ast.subtitle) {
            this.safeDrawText(page, ast.subtitle, {
              x: 40,
              y: currentY,
              size: 10,
              font: fontHelvetica,
              color: mutedRgb,
            });
            currentY -= 20;
          }

          this.safeDrawText(page, `Author: ${ast.author}  |  Date: ${ast.date}`, {
            x: 40,
            y: currentY,
            size: 8,
            font: fontHelvetica,
            color: mutedRgb,
          });
          currentY -= 25;

          page.drawLine({
            start: { x: 40, y: currentY },
            end: { x: width - 40, y: currentY },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
          });
          currentY -= 25;
        }
      };

      drawHeaderAndTitle(true);

      for (const node of allNodes) {
        // Estimate height needed for this node
        let estimatedHeight = 24;
        if (node.type === 'shloka') estimatedHeight = 50;
        else if (node.type === 'callout') estimatedHeight = 38;
        else if (node.type === 'paragraph') {
          const lines = this.wrapText(node.content, 90);
          estimatedHeight = lines.length * 14 + 8;
        }

        // Check if node fits on current page; if not, spawn NEXT page dynamically!
        if (currentY - estimatedHeight < 50) {
          page = pdfDoc.addPage([595.28, 841.89]);
          pageCount++;
          currentY = height - 50;
          drawHeaderAndTitle(false);
        }

        if (node.type === 'heading1') {
          this.safeDrawText(page, node.content, {
            x: 40,
            y: currentY,
            size: 13,
            font: fontHelveticaBold,
            color: primaryRgb,
          });
          currentY -= 24;
        } else if (node.type === 'heading2' || node.type === 'heading3') {
          this.safeDrawText(page, node.content, {
            x: 40,
            y: currentY,
            size: 11,
            font: fontHelveticaBold,
            color: textRgb,
          });
          currentY -= 20;
        } else if (node.type === 'shloka') {
          page.drawRectangle({
            x: 40,
            y: currentY - 35,
            width: width - 80,
            height: 40,
            color: rgb(0.96, 0.97, 1.0),
            borderColor: primaryRgb,
            borderWidth: 1,
          });
          this.safeDrawText(page, `[${node.citationId || 'Verse'}] ${node.content.replace(/\n/g, ' ')}`, {
            x: 50,
            y: currentY - 18,
            size: 9,
            font: fontHelveticaBold,
            color: primaryRgb,
          });
          if (node.subContent) {
            this.safeDrawText(page, node.subContent.slice(0, 80) + '...', {
              x: 50,
              y: currentY - 30,
              size: 8,
              font: fontHelvetica,
              color: textRgb,
            });
          }
          currentY -= 50;
        } else if (node.type === 'callout') {
          page.drawRectangle({
            x: 40,
            y: currentY - 25,
            width: width - 80,
            height: 30,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
          });
          this.safeDrawText(page, node.content, {
            x: 50,
            y: currentY - 18,
            size: 9,
            font: fontHelvetica,
            color: textRgb,
          });
          currentY -= 38;
        } else if (node.type === 'codeblock') {
          this.safeDrawText(page, node.content.split('\n')[0] || node.content, {
            x: 40,
            y: currentY,
            size: 8,
            font: fontCourier,
            color: rgb(0.2, 0.4, 0.8),
          });
          currentY -= 18;
        } else if (node.type === 'richhtml') {
          this.safeDrawText(page, node.content.replace(/<[^>]+>/g, '').substring(0, 80) + '...', {
            x: 40,
            y: currentY,
            size: 9.5,
            font: fontHelvetica,
            color: textRgb,
          });
          currentY -= 14;
        } else if (node.type === 'image') {
          this.safeDrawText(page, `[Image: ${node.imageAlt || 'image'}]`, {
            x: 40,
            y: currentY,
            size: 9.5,
            font: fontHelveticaBold,
            color: mutedRgb,
          });
          currentY -= 14;
        } else if (node.type === 'toc') {
          this.safeDrawText(page, 'Table of Contents', {
            x: 40,
            y: currentY,
            size: 11,
            font: fontHelveticaBold,
            color: primaryRgb,
          });
          currentY -= 20;
        } else if (node.type === 'footnote') {
          this.safeDrawText(page, `[^1] ${node.content}`, {
            x: 40,
            y: currentY,
            size: 7.5,
            font: fontHelvetica,
            color: mutedRgb,
          });
          currentY -= 12;
        } else {
          // Paragraph
          const lines = this.wrapText(node.content, 90);
          for (const line of lines) {
            if (currentY < 50) {
              page = pdfDoc.addPage([595.28, 841.89]);
              pageCount++;
              currentY = height - 50;
              drawHeaderAndTitle(false);
            }
            this.safeDrawText(page, line, {
              x: 40,
              y: currentY,
              size: 9.5,
              font: fontHelvetica,
              color: textRgb,
            });
            currentY -= 14;
          }
          currentY -= 8;
        }
      }
    } catch (err) {
      console.warn("PDF compilation outer boundary warning:", err);
    }

    const pdfBytes = await pdfDoc.save();
    const pdfArrayBuffer = (pdfBytes.buffer as ArrayBuffer).slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const pdfBlobUrl = URL.createObjectURL(pdfBlob);

    // 2. Compile DOCX via docx.js
    const docxChildren: (Paragraph | Table)[] = [];

    // Title
    docxChildren.push(
      new Paragraph({
        text: ast.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        text: `${ast.subtitle} | Author: ${ast.author}`,
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({ text: '' })
    );

    for (const pageData of ast.pages) {
      for (const node of pageData.nodes) {
        if (node.type === 'heading1') {
          docxChildren.push(
            new Paragraph({
              text: node.content,
              heading: HeadingLevel.HEADING_1,
            })
          );
        } else if (node.type === 'heading2') {
          docxChildren.push(
            new Paragraph({
              text: node.content,
              heading: HeadingLevel.HEADING_2,
            })
          );
        } else if (node.type === 'shloka') {
          docxChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: `[${node.citationId || 'Shloka'}] `, bold: true, color: '60A5FA' }),
                new TextRun({ text: node.content, italics: true }),
              ],
            })
          );
          if (node.subContent) {
            docxChildren.push(
              new Paragraph({
                text: `Translation: ${node.subContent}`,
              })
            );
          }
        } else if (node.type === 'table' && node.tableData) {
          const rows = node.tableData.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: cell.text,
                              bold: cell.isHeader,
                            }),
                          ],
                        }),
                      ],
                    })
                ),
              })
          );
          docxChildren.push(new Table({ rows }));
        } else if (node.type === 'richhtml') {
          docxChildren.push(new Paragraph({ text: node.content.replace(/<[^>]+>/g, '') }));
        } else if (node.type === 'image') {
          docxChildren.push(new Paragraph({ text: `[Image: ${node.imageAlt || 'image'}]` }));
        } else if (node.type === 'toc') {
          docxChildren.push(new Paragraph({ text: 'Table of Contents', heading: HeadingLevel.HEADING_3 }));
        } else if (node.type === 'footnote') {
          docxChildren.push(new Paragraph({ children: [
            new TextRun({ text: '[^1] ', superScript: true }),
            new TextRun({ text: node.content })
          ]}));
        } else if (node.type === 'divider' && node.subContent === 'PAGE_BREAK') {
          docxChildren.push(new Paragraph({ text: '--- Page Break ---', alignment: AlignmentType.CENTER }));
        } else {
          docxChildren.push(new Paragraph({ text: node.content }));
        }
      }
    }

    const docxDoc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: docxChildren,
        },
      ],
    });

    const docxBlob = await Packer.toBlob(docxDoc);
    const docxBlobUrl = URL.createObjectURL(docxBlob);

    // 3. Compile HTML Preview
    const htmlPreview = this.generateHtmlPreview(ast);

    const endTime = performance.now();
    const compilationTimeMs = Math.round(endTime - startTime);

    return {
      pdfArrayBuffer,
      pdfBlobUrl,
      docxBlob,
      docxBlobUrl,
      htmlPreview,
      compilationTimeMs,
      pdfSizeBytes: pdfBlob.size,
      docxSizeBytes: docxBlob.size,
      totalPages: pageCount,
    };
  }

  private static wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).length > maxCharsPerLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private static hexToRgb(hex: string) {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255 || 0.37;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255 || 0.64;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255 || 0.98;
    return rgb(r, g, b);
  }

  private static fontFamilyToCss(family: string): string {
    const map: Record<string, string> = {
      'geist-sans': "'Geist', sans-serif",
      'geist-mono': "'Geist Mono', monospace",
      'noto-serif-devanagari': "'Noto Serif Devanagari', Georgia, serif",
      'ibm-plex-serif': "'IBM Plex Serif', Georgia, serif",
      'dm-serif-display': "'DM Serif Display', Georgia, serif",
      'playfair-display': "'Playfair Display', Georgia, serif",
      'jetbrains-mono': "'JetBrains Mono', monospace",
      'noto-sans': "'Noto Sans', sans-serif",
      'inter': "'Inter', sans-serif",
    };
    return map[family] || "'Geist', sans-serif";
  }

  public static generateHtmlPreview(ast: ManthanaDocumentAST): string {
    const tokens = { ...DEFAULT_STYLE_TOKENS, ...(ast?.tokens || {}) };
    const htmlFontFamily = this.fontFamilyToCss(tokens.fontFamily);
    const bodyFontSize = tokens.fontSizeBody || tokens.fontSize || 11;

    let html = `<div class="document-paper-body" style="color: ${tokens.textColor}; line-height: ${tokens.lineHeight}; font-size: ${bodyFontSize}pt; font-family: ${htmlFontFamily}; letter-spacing: ${tokens.letterSpacing || 0}em;">`;

    for (let i = 0; i < ast.pages.length; i++) {
      const page = ast.pages[i];
      html += `<div class="document-page-sheet" data-page="${page.pageNumber}">`;

      if (tokens.headerText) {
        html += `<div class="page-header-line">${tokens.headerText}</div>`;
      }

      if (i === 0) {
        html += `<h1 class="doc-title" style="color: ${tokens.primaryColor}">${ast.title}</h1>`;
        if (ast.subtitle) html += `<p class="doc-subtitle">${ast.subtitle}</p>`;
        html += `<div class="doc-meta-bar"><span>Author: ${ast.author}</span> • <span>Date: ${ast.date}</span></div>`;
        html += `<hr class="doc-divider"/>`;
      }

      for (const node of page.nodes) {
        if (node.type === 'heading1') {
          html += `<h2 class="doc-h1" style="color: ${tokens.primaryColor}">${node.content}</h2>`;
        } else if (node.type === 'heading2') {
          html += `<h3 class="doc-h2">${node.content}</h3>`;
        } else if (node.type === 'heading3') {
          html += `<h4 class="doc-h3">${node.content}</h4>`;
        } else if (node.type === 'shloka') {
          html += `<div class="doc-shloka-box font-serif-devanagari">
            <span class="shloka-tag">${node.citationId || 'श्लोकः'}</span>
            <div class="shloka-text">${node.content.replace(/\n/g, '<br/>')}</div>
            ${node.subContent ? `<div class="shloka-subtext">${node.subContent}</div>` : ''}
          </div>`;
        } else if (node.type === 'callout') {
          html += `<div class="doc-callout-box">${node.content}</div>`;
        } else if (node.type === 'codeblock') {
          html += `<pre class="doc-codeblock font-mono"><code>${node.content}</code></pre>`;
        } else if (node.type === 'table' && node.tableData) {
          html += `<table class="doc-table"><tbody>`;
          for (const row of node.tableData) {
            html += `<tr>`;
            for (const cell of row) {
              const tag = cell.isHeader ? 'th' : 'td';
              html += `<${tag}>${cell.text}</${tag}>`;
            }
            html += `</tr>`;
          }
          html += `</tbody></table>`;
          html += `<div class="doc-kv-grid">`;
          for (const row of node.tableData) {
            html += `<div class="kv-item"><span class="kv-key">${row[0]?.text || ''}</span><span class="kv-val">${row[1]?.text || ''}</span></div>`;
          }
          html += `</div>`;
        } else if (node.type === 'richhtml') {
          html += `<div class="doc-richhtml">${node.htmlContent || node.content}</div>`;
        } else if (node.type === 'image') {
          html += `<div class="doc-image" style="text-align: center;"><img src="${node.imageUrl || node.content || ''}" alt="${node.imageAlt || ''}" style="max-width: 100%; border-radius: 6px;" /></div>`;
        } else if (node.type === 'toc') {
          html += `<div class="doc-toc"><h4>Table of Contents</h4></div>`;
        } else if (node.type === 'footnote') {
          html += `<div class="doc-footnote" style="font-size: 0.8em; color: gray;"><sup>[^1]</sup> ${node.content}</div>`;
        } else if (node.type === 'divider' && node.subContent === 'PAGE_BREAK') {
          html += `<div style="text-align: center; margin: 20px 0; opacity: 0.5; border-top: 2px dashed #999; padding-top: 4px; font-size: 0.75rem; text-transform: uppercase;">--- Page Break ---</div>`;
        } else {
          html += `<p class="doc-p">${node.content}</p>`;
        }
      }

      if (tokens.showPageNumbers) {
        html += `<div class="page-footer-line">Page ${i + 1} of ${ast.pages.length} • Q108 Scholar Client Engine</div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  public static generateEpub(ast: ManthanaDocumentAST): Blob {
    let epubContent = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head>\n<title>${ast.title}</title>\n</head>\n<body>\n`;
    epubContent += `<h1>${ast.title}</h1>\n`;
    if (ast.subtitle) epubContent += `<h2>${ast.subtitle}</h2>\n`;
    epubContent += `<p>Author: ${ast.author}</p>\n`;
    for (const page of ast.pages) {
      for (const node of page.nodes) {
        if (node.type === 'heading1') {
          epubContent += `<h1>${node.content}</h1>\n`;
        } else if (node.type === 'heading2') {
          epubContent += `<h2>${node.content}</h2>\n`;
        } else if (node.type === 'heading3') {
          epubContent += `<h3>${node.content}</h3>\n`;
        } else if (node.type === 'image') {
          epubContent += `<img src="${node.imageUrl || node.content}" alt="${node.imageAlt || ''}" />\n`;
        } else if (node.type === 'divider') {
          epubContent += `<hr />\n`;
        } else {
          epubContent += `<p>${node.content}</p>\n`;
        }
      }
    }
    epubContent += `</body>\n</html>`;
    return new Blob([epubContent], { type: 'application/epub+zip' });
  }

  public static generatePptx(ast: ManthanaDocumentAST): Blob {
    let pptxContent = `<?xml version="1.0" encoding="UTF-8"?>\n<presentation>\n`;
    pptxContent += `<slide>\n<title>${ast.title}</title>\n<subtitle>${ast.subtitle || ''}</subtitle>\n</slide>\n`;
    
    let currentSlide = '';
    for (const page of ast.pages) {
      for (const node of page.nodes) {
        if (node.type === 'heading1') {
          if (currentSlide) {
            pptxContent += `<slide>\n${currentSlide}</slide>\n`;
            currentSlide = '';
          }
          currentSlide += `<h1>${node.content}</h1>\n`;
        } else if (node.type === 'heading2') {
          currentSlide += `<h2>${node.content}</h2>\n`;
        } else if (node.type === 'heading3') {
          currentSlide += `<h3>${node.content}</h3>\n`;
        } else if (node.type === 'image') {
          currentSlide += `<img src="${node.imageUrl || node.content}" alt="${node.imageAlt || ''}" />\n`;
        } else if (node.type === 'divider') {
          currentSlide += `<hr />\n`;
        } else {
          currentSlide += `<p>${node.content}</p>\n`;
        }
      }
      if (currentSlide) {
        pptxContent += `<slide>\n${currentSlide}</slide>\n`;
        currentSlide = '';
      }
    }
    pptxContent += `</presentation>`;
    return new Blob([pptxContent], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
}
