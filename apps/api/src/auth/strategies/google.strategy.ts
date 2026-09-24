import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, type Profile, type VerifyCallback } from "passport-google-oauth20";
import { loadEnv } from "../../config/env";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor() {
    const env = loadEnv();
    // `||` (not `??`) on purpose: an unset var in .env loads as "" not
    // undefined, and passport-oauth2 throws synchronously in its
    // constructor on a falsy clientID — this must never be empty.
    super({
      clientID: env.GOOGLE_CLIENT_ID || "unconfigured",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "unconfigured",
      callbackURL: env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback",
      scope: ["email", "profile"]
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error("Google account has no email"), undefined);
    }
    done(undefined, {
      googleId: profile.id,
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value
    });
  }
}
