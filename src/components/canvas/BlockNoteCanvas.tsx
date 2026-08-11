import React, { useEffect } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import type { ManthanaDocumentAST } from '../../types/ast';
import { UniversalConverterService } from '../../services/converter';

interface BlockNoteCanvasProps {
  ast: ManthanaDocumentAST;
  onUpdateAST: (updated: ManthanaDocumentAST) => void;
  paperTheme: 'dark' | 'light';
}

export const BlockNoteCanvas: React.FC<BlockNoteCanvasProps> = ({
  ast,
  onUpdateAST,
  paperTheme,
}) => {
  // Create BlockNote editor instance
  const editor = useCreateBlockNote();

  // Compute a deep node-count signature so we re-sync whenever nodes are added/removed on any page.
  // This covers E2B-injected nodes which don't change ast.id or ast.pages.length.
  const nodeCountSignature = ast.pages.map((p) => p.nodes.length).join('-');

  // Sync AST nodes into BlockNote when AST updates externally
  useEffect(() => {
    if (!editor || !ast) return;

    try {
      const markdown = UniversalConverterService.astToMarkdown(ast);
      const blocks = editor.tryParseMarkdownToBlocks(markdown);
      if (blocks && blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
      }

      // Fix 6: Inject base64 image nodes that markdown parser cannot handle.
      // BlockNote's tryParseMarkdownToBlocks() silently drops data: URI images,
      // so we insert them manually as image blocks after replacing document blocks.
      const imageNodes = ast.pages
        .flatMap((p) => p.nodes)
        .filter((n) => n.type === 'image' && n.imageUrl?.startsWith('data:'));

      for (const imgNode of imageNodes) {
        try {
          const lastBlock = editor.document[editor.document.length - 1];
          if (lastBlock && imgNode.imageUrl) {
            editor.insertBlocks(
              [{ type: 'image', props: { url: imgNode.imageUrl, caption: imgNode.content || '' } }],
              lastBlock,
              'after'
            );
          }
        } catch {
          // Individual image insertion failures are non-fatal
        }
      }
    } catch (err) {
      console.warn('BlockNote sync warning:', err);
    }
  }, [ast.id, nodeCountSignature]);

  // Handle document edits inside BlockNote — write back to AST
  const handleChange = () => {
    if (!editor) return;
    try {
      const md = editor.blocksToMarkdownLossy(editor.document);
      const updatedAst = UniversalConverterService.markdownToAst(md, ast.title || 'Untitled Document');
      onUpdateAST({
        ...ast,
        pages: updatedAst.pages,
      });
    } catch (err) {
      console.warn('BlockNote onChange warning:', err);
    }
  };

  return (
    <div
      className="blocknote-canvas-wrapper"
      style={{
        width: '100%',
        minHeight: '100%',
        background: paperTheme === 'dark' ? '#121212' : '#ffffff',
        color: paperTheme === 'dark' ? '#f4f4f5' : '#18181b',
        padding: '24px 32px',
        borderRadius: '8px',
      }}
    >
      <BlockNoteView
        editor={editor}
        theme={paperTheme === 'dark' ? 'dark' : 'light'}
        onChange={handleChange}
      />
    </div>
  );
};
