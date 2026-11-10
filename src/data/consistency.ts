/**
 * One generated record per seed. The identity consistency group
 * (idCard / date / gender / personName) is produced together here, never by
 * the individual generators. GB 11643 check digit, valid region code and a
 * real calendar date are enforced at construction time.
 */
import { createRng } from '../utils/rng';

export interface GeneratedRecord {
  readonly personName: string;
  readonly gender: string;
  readonly idCard: string;
  readonly birthDate: string;
  readonly date: string;
  readonly phone: string;
  readonly landline: string;
  readonly email: string;
  readonly time: string;
  readonly region: string;
  readonly address: string;
  readonly organization: string;
  readonly school: string;
  readonly education: string;
  readonly jobTitle: string;
  readonly code: string;
  readonly amount: string;
  readonly quantity: string;
  readonly percentage: string;
  readonly dictEnum: string;
  readonly longText: string;
}

/** Real GB/T 2260 county codes. No invented region prefixes. */
const REGION_CODES = [
  '110101', '110105', '120101', '310101', '310104', '310115',
  '320102', '320106', '330102', '330106', '340102', '350102',
  '360102', '370102', '410102', '420102', '430102', '440103',
  '440305', '440106', '450102', '460102', '500103', '510104',
  '520102', '530102', '610102', '620102', '630102', '640102',
] as const;

/** Real mobile number segments, all matching ^1[3-9][0-9]{9}$. */
const PHONE_PREFIXES = [
  '130', '131', '132', '133', '134', '135', '136', '137', '138', '139',
  '150', '151', '152', '153', '155', '156', '157', '158', '159',
  '166', '176', '177', '178', '180', '181', '182', '183', '184',
  '185', '186', '187', '188', '189', '190', '191', '199',
] as const;

const AREA_CODES = ['010', '021', '022', '023', '025', '027', '020', '0755', '0571'] as const;
const EMAIL_DOMAINS = ['example.com', 'test.example.cn', 'mail.example.org'] as const;

const SURNAMES = [
  '张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴',
  '徐', '孙', '朱', '马', '胡', '郭', '何', '高', '林', '罗',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹',
] as const;

const GIVEN_CHARS = [
  '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋',
  '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚',
  '桂', '兰', '文', '辉', '俊', '峰', '建', '华', '晨', '宇',
  '宁', '欣', '然', '琳', '婷', '博', '成', '安', '睿', '洁',
] as const;

const PROVINCES = ['北京市', '上海市', '浙江省', '江苏省', '广东省', '四川省', '湖北省', '陕西省'] as const;
const CITIES = ['海淀区', '浦东新区', '西湖区', '鼓楼区', '南山区', '武侯区', '武昌区', '雁塔区'] as const;
const DISTRICTS = ['中关村街道', '张江镇', '文三路街道', '湖南路街道', '粤海街道', '桂溪街道', '珞南街道', '小寨路街道'] as const;
const STREETS = ['学院路', '人民路', '建设大道', '科技一路', '解放路', '中山北路', '春熙路'] as const;
const ORG_PREFIX = ['华信', '恒通', '远见', '同方', '中诚', '启明', '方圆', '国泰'] as const;
const ORG_SUFFIX = ['信息技术有限公司', '数据服务中心', '规划设计研究院', '建设工程管理局'] as const;
const SCHOOLS = ['第一中学', '实验小学', '职业技术学院', '大学', '附属中学'] as const;
const EDUCATIONS = ['大学本科', '硕士研究生', '博士研究生', '大学专科', '高中'] as const;
const JOB_TITLES = ['工程师', '主管', '专员', '项目经理', '研究员', '技术负责人'] as const;
const SENTENCES = [
  '负责完成本年度业务系统测试与数据核对工作，相关材料已归档。',
  '按照项目计划推进实施，按期完成阶段目标并通过内部评审。',
  '参与需求梳理与方案讨论，整理形成可复用的操作说明。',
  '配合完成现场联调，记录问题清单并跟踪闭环处理结果。',
] as const;

const CHECK_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const;
const CHECK_CODES = '10X98765432';

export function gb11643CheckDigit(first17: string): string {
  let sum = 0;
  for (let index = 0; index < 17; index += 1) {
    const digit = Number(first17.charAt(index));
    sum += (Number.isFinite(digit) ? digit : 0) * (CHECK_WEIGHTS[index] ?? 0);
  }
  return CHECK_CODES.charAt(sum % 11) || '0';
}

export function isValidIdCard(value: string): boolean {
  if (!/^\d{17}[\dX]$/.test(value)) return false;
  return gb11643CheckDigit(value.slice(0, 17)) === value.charAt(17);
}

export function birthDateOf(idCard: string): string {
  const year = idCard.slice(6, 10);
  const month = idCard.slice(10, 12);
  const day = idCard.slice(12, 14);
  return year + '-' + month + '-' + day;
}

export function genderOf(idCard: string): string {
  const parity = Number(idCard.charAt(16));
  return Number.isFinite(parity) && parity % 2 === 1 ? '男' : '女';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function createGeneratedRecord(seed: number): GeneratedRecord {
  const rng = createRng(seed);
  const gender = rng.bool() ? '男' : '女';
  const year = rng.int(1968, 2000);
  const month = rng.int(1, 12);
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = rng.int(1, daysInMonth);
  const birthDate = year + '-' + pad(month) + '-' + pad(day);

  const regionCode = rng.pick(REGION_CODES);
  const sequence = rng.digits(2);
  const parityDigit = rng.int(0, 4) * 2 + (gender === '男' ? 1 : 0);
  const first17 = regionCode + String(year) + pad(month) + pad(day) + sequence + String(parityDigit);
  const idCard = first17 + gb11643CheckDigit(first17);

  const personName = rng.pick(SURNAMES) +
    rng.pick(GIVEN_CHARS) +
    (rng.bool() ? rng.pick(GIVEN_CHARS) : '');
  const city = rng.pick(CITIES);
  const district = rng.pick(DISTRICTS);
  const region = rng.pick(PROVINCES) + city + district;
  const address = region + rng.pick(STREETS) + rng.int(1, 200) + '号' + rng.int(1, 20) + '室';

  return {
    personName,
    gender,
    idCard,
    birthDate,
    date: birthDate,
    phone: rng.pick(PHONE_PREFIXES) + rng.digits(8),
    landline: rng.pick(AREA_CODES) + '-' + rng.digits(8),
    email: 'user' + rng.digits(6) + '@' + rng.pick(EMAIL_DOMAINS),
    time: pad(rng.int(8, 18)) + ':' + pad(rng.int(0, 59)) + ':' + pad(rng.int(0, 59)),
    region,
    address,
    organization: city + rng.pick(ORG_PREFIX) + rng.pick(ORG_SUFFIX),
    school: city + rng.pick(SCHOOLS),
    education: rng.pick(EDUCATIONS),
    jobTitle: rng.pick(JOB_TITLES),
    code: 'A' + rng.digits(6),
    amount: (rng.int(1000, 999999) / 100).toFixed(2),
    quantity: String(rng.int(1, 99)),
    percentage: String(rng.int(1, 99)),
    dictEnum: '',
    longText: rng.pick(SENTENCES),
  };
}
