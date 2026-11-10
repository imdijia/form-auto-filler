import type { FieldTypeKey } from '../../contracts/field-metadata';
import type { GeneratorFn } from './shared';
import { generatePersonName } from './person-name';
import { generateGender } from './gender';
import { generateIdCard } from './id-card';
import { generatePhone } from './phone';
import { generateLandline } from './landline';
import { generateEmail } from './email';
import { generateDate } from './date';
import { generateTime } from './time';
import { generateRegion } from './region';
import { generateAddress } from './address';
import { generateOrganization } from './organization';
import { generateSchool } from './school';
import { generateEducation } from './education';
import { generateJobTitle } from './job-title';
import { generateCode } from './code';
import { generateAmount } from './amount';
import { generateQuantity } from './quantity';
import { generatePercentage } from './percentage';
import { generateDictEnum } from './dict-enum';
import { generateLongText } from './long-text';

/** One generator per authoritative slug. No 'unknown' entry: the sentinel is
    not a generator target. */
export const GENERATORS: Readonly<Record<FieldTypeKey, GeneratorFn>> = Object.freeze({
  personName: generatePersonName,
  gender: generateGender,
  idCard: generateIdCard,
  phone: generatePhone,
  landline: generateLandline,
  email: generateEmail,
  date: generateDate,
  time: generateTime,
  region: generateRegion,
  address: generateAddress,
  organization: generateOrganization,
  school: generateSchool,
  education: generateEducation,
  jobTitle: generateJobTitle,
  code: generateCode,
  amount: generateAmount,
  quantity: generateQuantity,
  percentage: generatePercentage,
  dictEnum: generateDictEnum,
  longText: generateLongText,
});

export type { GeneratorFn, GeneratorInput } from './shared';
