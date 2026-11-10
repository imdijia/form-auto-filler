import type { ControlType, FieldDescriptor } from '../contracts';

export type TagName = FieldDescriptor['tagName'];
export type LibraryKind = 'ant-design-vue' | 'element-plus' | 'native' | 'unknown';

export interface ControlShape {
  readonly controlType: ControlType;
  readonly tagName: TagName;
  readonly inputType: string;
  readonly componentRoot: HTMLElement | null;
  readonly library: LibraryKind;
  readonly unsupported: boolean;
}

const CASCADER = '.ant-cascader, .el-cascader';
const ANT_PICKER = '.ant-picker';
const EL_DATE = '.el-date-editor, .el-date-editor--daterange';
const ANT_SELECT = '.ant-select';
const EL_SELECT = '.el-select';
export const COMPONENT_ROOT_SELECTOR = [
  CASCADER,
  ANT_PICKER,
  EL_DATE,
  ANT_SELECT,
  EL_SELECT,
].join(', ');

export function findComponentRoot(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>(COMPONENT_ROOT_SELECTOR);
}

/** ARCH 17.6: classify by displayed shape, never by "framework detected". */
export function readControlShape(element: HTMLElement): ControlShape {
  const root = findComponentRoot(element);
  if (root) {
    if (root.matches(CASCADER)) {
      return {
        controlType: 'select',
        tagName: 'CUSTOM',
        inputType: 'cascader',
        componentRoot: root,
        library: root.classList.contains('ant-cascader') ? 'ant-design-vue' : 'element-plus',
        unsupported: true,
      };
    }
    if (root.matches(ANT_PICKER) || root.matches(EL_DATE)) {
      return {
        controlType: 'date',
        tagName: 'INPUT',
        inputType: 'date',
        componentRoot: root,
        library: root.matches(ANT_PICKER) ? 'ant-design-vue' : 'element-plus',
        unsupported: false,
      };
    }
    const remote =
      root.classList.contains('ant-select-show-search') ||
      root.classList.contains('el-select--remote') ||
      root.hasAttribute('remote');
    return {
      controlType: 'select',
      tagName: 'CUSTOM',
      inputType: 'select',
      componentRoot: root,
      library: root.matches(ANT_SELECT) ? 'ant-design-vue' : 'element-plus',
      unsupported: remote,
    };
  }

  if (element instanceof HTMLSelectElement) {
    return { controlType: 'select', tagName: 'SELECT', inputType: '', componentRoot: null, library: 'native', unsupported: false };
  }
  if (element instanceof HTMLTextAreaElement) {
    return { controlType: 'textarea', tagName: 'TEXTAREA', inputType: '', componentRoot: null, library: 'native', unsupported: false };
  }
  if (element.isContentEditable) {
    return { controlType: 'textarea', tagName: 'CONTENTEDITABLE', inputType: '', componentRoot: null, library: 'native', unsupported: false };
  }
  if (element instanceof HTMLInputElement) {
    const inputType = (element.type || 'text').toLowerCase();
    const controlType: ControlType =
      inputType === 'checkbox' || inputType === 'radio' ? 'other' : 'input';
    return {
      controlType,
      tagName: 'INPUT',
      inputType,
      componentRoot: null,
      library: 'native',
      unsupported: false,
    };
  }
  return {
    controlType: 'other',
    tagName: 'CUSTOM',
    inputType: '',
    componentRoot: null,
    library: 'unknown',
    unsupported: true,
  };
}

export function isVisuallyHidden(element: HTMLElement, document: Document): boolean {
  if (element.hidden) return true;
  if (element.closest('[hidden]')) return true;
  const style = document.defaultView?.getComputedStyle(element);
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}
