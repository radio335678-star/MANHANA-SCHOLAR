import { DocumentCompilerService } from '../services/documentCompiler';

self.onmessage = async (e: MessageEvent) => {
  const { type, ast } = e.data;
  if (type === 'COMPILE_DOCUMENT') {
    try {
      const output = await DocumentCompilerService.compileDocument(ast);
      self.postMessage({ type: 'COMPILE_SUCCESS', output });
    } catch (err: any) {
      self.postMessage({ type: 'COMPILE_ERROR', error: err.message });
    }
  }
};
