import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAnswerAsGuest,
  loadQuizSession,
  NetworkError,
  startQuizSession,
  submitAnswer,
} from './client-api';

// The retry rules from #58, pinned. They are the difference between "one dropped
// request ends the round" and "one dropped request is invisible", and between
// "a retry is safe" and "a retry starts a second round".

const ok = (body: unknown = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const dropped = () => Promise.reject(new TypeError('Failed to fetch'));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Settles a call that is waiting out its backoff, with the clock moved on. */
const settle = async <T>(call: Promise<T>): Promise<PromiseSettledResult<T>> => {
  const result = call.then(
    (value) => ({ status: 'fulfilled', value }) as const,
    (reason) => ({ status: 'rejected', reason }) as const,
  );
  await vi.runAllTimersAsync();
  return result;
};

describe('a read retries a transport failure, twice', () => {
  it('succeeds when the third attempt gets through', async () => {
    fetchMock
      .mockImplementationOnce(dropped)
      .mockImplementationOnce(dropped)
      .mockResolvedValue(ok({ id: 's' }));
    const result = await settle(loadQuizSession('s'));
    expect(result).toMatchObject({ status: 'fulfilled', value: { id: 's' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after three attempts with a message a player can read', async () => {
    fetchMock.mockImplementation(dropped);
    const result = await settle(loadQuizSession('s'));
    expect(result.status).toBe('rejected');
    const reason = (result as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(NetworkError);
    expect(reason.message).toBe('Couldn’t reach the server. Check your connection and try again.');
    expect(reason.message).not.toContain('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('waits 300ms, then 900ms, between attempts', async () => {
    fetchMock.mockImplementation(dropped);
    const call = loadQuizSession('s').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(299);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(899);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await call;
  });
});

describe('a POST retries only if it says so', () => {
  it('retries an answer: the api replays a repeat rather than scoring it twice', async () => {
    fetchMock.mockImplementationOnce(dropped).mockResolvedValue(ok({ wasCorrect: true }));
    const result = await settle(submitAnswer('s', { sequence: 1, answer: 'Paris' }));
    expect(result.status).toBe('fulfilled');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a guest’s answer check, which writes nothing', async () => {
    fetchMock.mockImplementationOnce(dropped).mockResolvedValue(ok({ wasCorrect: false }));
    await settle(checkAnswerAsGuest({ quizTypeKey: 'k', countryId: 1, answer: 'x' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries starting a session: a second one would be a second round', async () => {
    fetchMock.mockImplementation(dropped);
    const result = await settle(startQuizSession({ quizTypeKey: 'capitals-c2cap-mc' }));
    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('an answer from the server is not retried', () => {
  it('surfaces the server’s message for a 4xx, after one attempt', async () => {
    fetchMock.mockResolvedValue(ok({ error: 'bad_request', message: 'No such question' }, 404));
    const result = await settle(submitAnswer('s', { sequence: 9, answer: 'x' }));
    expect(result).toMatchObject({ status: 'rejected', reason: { message: 'No such question' } });
    expect((result as PromiseRejectedResult).reason).not.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 500 either — sending it again would only get it twice', async () => {
    fetchMock.mockResolvedValue(ok({ message: 'Something went wrong' }, 500));
    await settle(loadQuizSession('s'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the status when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    const result = await settle(loadQuizSession('s'));
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { message: 'Request failed (502)' },
    });
  });
});

describe('what goes on the wire', () => {
  it('sends a POST as JSON through the /bff proxy', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await settle(submitAnswer('abc', { sequence: 2, answer: 'Rome', timeTakenMs: 900 }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/bff/sessions/abc/answers');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      sequence: 2,
      answer: 'Rome',
      timeTakenMs: 900,
    });
  });

  it('sends a read with no body and no content type', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await settle(loadQuizSession('abc'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/bff/sessions/abc');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });
});
