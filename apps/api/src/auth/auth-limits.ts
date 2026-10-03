import { RateLimiter } from "../common/rate-limiter";

// Brute-force and abuse limits for the unauthenticated auth endpoints. Per API
// process (like the other public limiters); each limit is keyed on something
// the attacker can't rotate cheaply — the account being attacked — as well as
// on the caller's address.
const MIN = 60_000;

const loginByIp = new RateLimiter(30, 15 * MIN);
const loginByAccount = new RateLimiter(8, 15 * MIN);
const signupByIp = new RateLimiter(10, 60 * MIN);
const otpRequestByTarget = new RateLimiter(5, 15 * MIN);
const otpRequestByIp = new RateLimiter(20, 60 * MIN);
const otpVerifyByTarget = new RateLimiter(10, 15 * MIN);
const otpVerifyByIp = new RateLimiter(40, 15 * MIN);

const norm = (s: string) => s.trim().toLowerCase();

export const authLimits = {
  login(ip: string, email: string) {
    loginByIp.consume(ip);
    loginByAccount.consume(norm(email));
  },
  signup(ip: string) {
    signupByIp.consume(ip);
  },
  otpRequest(ip: string, target: string) {
    otpRequestByIp.consume(ip);
    otpRequestByTarget.consume(norm(target));
  },
  otpVerify(ip: string, target: string) {
    otpVerifyByIp.consume(ip);
    otpVerifyByTarget.consume(norm(target));
  }
};
