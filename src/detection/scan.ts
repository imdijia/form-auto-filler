import { LIMITS } from '../contracts';
import type { DetectionContext, FieldHandle } from '../contracts';
import { COMPONENT_ROOT_SELECTOR, readControlShape } from './control-type';
import { buildDescriptor, isNonControlInput } from './field-descriptor';
import type { ContainerAwareContext } from './scope-selector';

export interface ScanReport {
  readonly handles: FieldHandle[];
  readonly totalFound: number;
  readonly truncated: boolean;
}

const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const MAX_FRAME_DEPTH = 2;

function ownerDocument(root: ParentNode): Document {
  if (root instanceof Document) return root;
  if (root instanceof DocumentFragment) return root.ownerDocument;
  return (root as Element).ownerDocument;
}

/**
 * L1 scan. v2: EVERY visible control under the selected container is a
 * candidate. Component-library wrapper nodes with no native child control
 * are added once so their diagnosis is not silently lost. Same-origin
 * iframes are best-effort; a cross-origin access failure never blocks.
 */
function collect(
  root: ParentNode,
  frameIndex: number,
  ctx: DetectionContext,
  inScope: boolean,
  out: FieldHandle[],
): void {
  const document = ownerDocument(root);
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR));
  const wrappedRoots = new Set<HTMLElement>();

  for (const node of nodes) {
    const shape = readControlShape(node);
    if (isNonControlInput(shape)) continue;
    if (shape.componentRoot) wrappedRoots.add(shape.componentRoot);
    const descriptor = buildDescriptor(
      node, out.length, frameIndex, ctx.scope, document, inScope,
    );
    out.push({
      descriptor,
      element: node,
      isConnected: () => node.isConnected,
    });
  }

  for (const wrapper of Array.from(root.querySelectorAll<HTMLElement>(COMPONENT_ROOT_SELECTOR))) {
    if (wrappedRoots.has(wrapper)) continue;
    const descriptor = buildDescriptor(
      wrapper, out.length, frameIndex, ctx.scope, document, inScope,
    );
    out.push({
      descriptor,
      element: wrapper,
      isConnected: () => wrapper.isConnected,
    });
  }

  if (frameIndex >= MAX_FRAME_DEPTH) return;
  for (const iframe of Array.from(root.querySelectorAll('iframe'))) {
    let frameDocument: Document | null = null;
    try {
      frameDocument = iframe.contentDocument;
    } catch {
      // Cross-origin iframe: best effort only, never a blocking failure.
    }
    if (frameDocument && frameDocument !== document) {
      collect(frameDocument, frameIndex + 1, ctx, inScope, out);
    }
  }
}

/** Detect all visible controls under ctx.root. No assumed field count. */
export function scan(ctx: DetectionContext): ScanReport {
  const found: FieldHandle[] = [];
  const inScope = (ctx as ContainerAwareContext).containerAware === true;
  collect(ctx.root, 0, ctx, inScope, found);
  ctx.logger.debug('scan_complete', { count: found.length });
  const truncated = found.length > LIMITS.MAX_FIELDS_PER_PAGE;
  return {
    handles: truncated ? found.slice(0, LIMITS.MAX_FIELDS_PER_PAGE) : found,
    totalFound: found.length,
    truncated,
  };
}
