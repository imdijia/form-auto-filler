import type {
  DetectionContext,
  EffectiveRules,
  FieldDescriptor,
  FieldDetector,
  FieldHandle,
} from '../contracts';
import { infer } from './infer';
import { applyOverrides } from './picker';
import { scan, type ScanReport } from './scan';

export interface DetectorEx extends FieldDetector {
  readonly lastScan: ScanReport | null;
}

export function createDetector(): DetectorEx {
  let lastScan: ScanReport | null = null;
  return {
    get lastScan(): ScanReport | null {
      return lastScan;
    },
    scan(ctx: DetectionContext): FieldHandle[] {
      lastScan = scan(ctx);
      return lastScan.handles;
    },
    infer(handles: FieldHandle[], ctx: DetectionContext): FieldDescriptor[] {
      return infer(handles, ctx);
    },
    applyOverrides(fields: FieldDescriptor[], rules: EffectiveRules): FieldDescriptor[] {
      return applyOverrides(fields, rules);
    },
    detect(ctx: DetectionContext): FieldDescriptor[] {
      const handles = this.scan(ctx);
      return this.applyOverrides(this.infer(handles, ctx), ctx.rules);
    },
  };
}
