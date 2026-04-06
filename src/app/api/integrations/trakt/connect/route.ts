import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  buildTraktAuthorizeUrl,
  linkTraktAccount,
  TRAKT_OAUTH_STATE_COOKIE,
} from "@/lib/services/trakt";

function buildAppUrl(path: string) {
  return new URL(path, env.nextAuthUrl);
}

function buildSettingsRedirect(type: "success" | "error", message: string) {
  const url = buildAppUrl("/app/settings");
  url.searchParams.set("traktStatus", type);
  url.searchParams.set("traktMessage", message);
  return url;
}

function toRelativeUrl(url: URL) {
  return `${url.pathname}${url.search}`;
}

function setStateCookie(response: NextResponse, state: string) {
  response.cookies.set(TRAKT_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nextAuthUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function GET(request: NextRequest) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.redirect(buildAppUrl("/sign-in"));
  }

  if (!env.traktUseMockData && (!env.traktClientId || !env.traktClientSecret)) {
    return NextResponse.redirect(
      buildSettingsRedirect("error", "Trakt OAuth is not configured for this environment."),
    );
  }

  if (env.traktUseMockData) {
    try {
      await linkTraktAccount({
        userId: user.userId,
        householdId: user.householdId,
        email: user.email,
        code: `mock-${user.userId}`,
      });
      return NextResponse.redirect(
        buildSettingsRedirect("success", "Trakt connected. Run a sync to import your history."),
      );
    } catch (error) {
      return NextResponse.redirect(
        buildSettingsRedirect(
          "error",
          error instanceof Error ? error.message : "Unable to connect Trakt.",
        ),
      );
    }
  }

  const state = randomUUID();
  const redirectTarget = new URL(buildTraktAuthorizeUrl(state));

  const response = NextResponse.redirect(redirectTarget);
  setStateCookie(response, state);

  return response;
}

export async function POST(request: NextRequest) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!env.traktUseMockData && (!env.traktClientId || !env.traktClientSecret)) {
    return NextResponse.json(
      { error: "Trakt OAuth is not configured for this environment." },
      { status: 400 },
    );
  }

  if (env.traktUseMockData) {
    try {
      await linkTraktAccount({
        userId: user.userId,
        householdId: user.householdId,
        email: user.email,
        code: `mock-${user.userId}`,
      });
      const redirectTo = toRelativeUrl(
        buildSettingsRedirect("success", "Trakt connected. Run a sync to import your history."),
      );

      return NextResponse.json({
        redirectTo,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Unable to connect Trakt.",
        },
        { status: 500 },
      );
    }
  }

  const state = randomUUID();
  const response = NextResponse.json({
    authorizationUrl: buildTraktAuthorizeUrl(state),
  });
  setStateCookie(response, state);
  return response;
}
