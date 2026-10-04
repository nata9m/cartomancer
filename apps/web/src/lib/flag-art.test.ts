// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flagSrc, preloadQuestionFlags } from './flag-art';

const question = (promptIsoCode?: string, options: string[] = []) =>
  ({ promptIsoCode, options: options.map((isoCode) => ({ isoCode })) }) as never;

describe('flagSrc', () => {
  it('lower-cases the code to match the vendored file names', () => {
    expect(flagSrc('FR')).toBe('/flag-art/fr.svg');
    expect(flagSrc('tv')).toBe('/flag-art/tv.svg');
  });
});

describe('preloadQuestionFlags', () => {
  const started: string[] = [];
  class FakeImage {
    set src(value: string) {
      started.push(value);
    }
  }

  afterEach(() => {
    started.length = 0;
  });

  it('starts the download of every flag a question will show', () => {
    vi.stubGlobal('Image', FakeImage);
    preloadQuestionFlags(question('jp', ['aa', 'ab', 'ac']));
    expect(started).toEqual([
      '/flag-art/jp.svg',
      '/flag-art/aa.svg',
      '/flag-art/ab.svg',
      '/flag-art/ac.svg',
    ]);
  });

  it('asks for a flag once, however many questions share it', () => {
    vi.stubGlobal('Image', FakeImage);
    preloadQuestionFlags(question('qa', ['qb']));
    preloadQuestionFlags(question('qb', ['qa', 'qc']));
    expect(started.filter((src) => src === '/flag-art/qa.svg')).toHaveLength(1);
    expect(started.filter((src) => src === '/flag-art/qb.svg')).toHaveLength(1);
    expect(started).toContain('/flag-art/qc.svg');
  });

  it('skips options that carry no flag, and a question that is not there', () => {
    vi.stubGlobal('Image', FakeImage);
    expect(() => preloadQuestionFlags(undefined)).not.toThrow();
    preloadQuestionFlags({ options: [{ label: 'Paris' }, { isoCode: 'zz' }] } as never);
    expect(started).toEqual(['/flag-art/zz.svg']);
  });
});
