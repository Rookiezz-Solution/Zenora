import { RateLimiter } from "../common/rate-limiter";

// Brute-force and abuse limits for the unauthenticated auth endpoints. Counted
// in Redis when it is available (so adding API instances does not multiply the
// limits), otherwise per process; each limit is keyed on something the attacker
// can't rotate cheaply — the account being attacked — as well as on the
// caller's address.
const MIN = 60_000;

const loginByIp = new RateLimiter(30, 15 * MIN, "login-ip");
const loginByAccount = new RateLimiter(8, 15 * MIN, "login-account");
const signupByIp = new RateLimiter(10, 60 * MIN, "signup-ip");
const otpRequestByTarget = new RateLimiter(5, 15 * MIN, "otp-request-target");
const otpRequestByIp = new RateLimiter(20, 60 * MIN, "otp-request-ip");
const otpVerifyByTarget = new RateLimiter(10, 15 * MIN, "otp-verify-target");
const otpVerifyByIp = new RateLimiter(40, 15 * MIN, "otp-verify-ip");

const norm = (s: string) => s.trim().toLowerCase();

export const authLimits = {
  async login(ip: string, email: string) {
    await loginByIp.consume(ip);
    await loginByAccount.consume(norm(email));
  },
  async signup(ip: string) {
    await signupByIp.consume(ip);
  },
  async otpRequest(ip: string, target: string) {
    await otpRequestByIp.consume(ip);
    await otpRequestByTarget.consume(norm(target));
  },
  async otpVerify(ip: string, target: string) {
    await otpVerifyByIp.consume(ip);
    await otpVerifyByTarget.consume(norm(target));
  }
};
