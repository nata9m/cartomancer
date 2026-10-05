// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getSeenCountries, markCountrySeen } from './seen-countries';

beforeEach(() => {
  window.localStorage.clear();
});

describe('the guest country rotation list (#96)', () => {
  it('starts empty', () => {
    expect(getSeenCountries('capitals-c2cap-mc')).toEqual({});
  });

  it('records a country with the time it was asked', () => {
    markCountrySeen('capitals-c2cap-mc', 7, 1000);
    expect(getSeenCountries('capitals-c2cap-mc')).toEqual({ '7': 1000 });
  });

  it('keeps a separate list for each quiz type', () => {
    markCountrySeen('capitals-c2cap-mc', 1, 100);
    markCountrySeen('flags-flag2c-mc', 2, 200);
    expect(getSeenCountries('capitals-c2cap-mc')).toEqual({ '1': 100 });
    expect(getSeenCountries('flags-flag2c-mc')).toEqual({ '2': 200 });
  });

  it('moves a country that comes round again to its new time', () => {
    markCountrySeen('map-c2loc', 1, 100);
    markCountrySeen('map-c2loc', 2, 200);
    markCountrySeen('map-c2loc', 1, 300);
    expect(getSeenCountries('map-c2loc')).toEqual({ '1': 300, '2': 200 });
  });

  it('survives storage that is broken or hand-edited', () => {
    window.localStorage.setItem('cartomancer.seenCountries.v1', '{not json');
    expect(getSeenCountries('map-c2loc')).toEqual({});
    window.localStorage.setItem('cartomancer.seenCountries.v1', '[1,2]');
    expect(getSeenCountries('map-c2loc')).toEqual({});
    window.localStorage.setItem('cartomancer.seenCountries.v1', '{"map-c2loc": 5}');
    expect(getSeenCountries('map-c2loc')).toEqual({});
    markCountrySeen('map-c2loc', 3, 1);
    expect(getSeenCountries('map-c2loc')).toEqual({ '3': 1 });
  });
});
