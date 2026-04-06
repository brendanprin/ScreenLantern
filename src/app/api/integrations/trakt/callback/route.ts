import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { linkTraktAccount, TRAKT_OAUTH_STATE_COOKIE } from "@/lib/services/trakt";

function buildAppUrl(path: string) {
  return new URL(path, env.nextAuthUrl);
}

function buildSettingsRedirect(type: "success" | "error", message: string) {
  const url = buildAppUrl("/app/settings");
  url.searchParams.set("traktStatus", type);
  url.searchParams.set("traktMessage", message);
  return url;
}

function redirectWithStateCleanup(url: URL) {
  const response = NextResponse.redirect(url);
  response.cookies.delete(TRAKT_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.redirect(buildAppUrl("/sign-in"));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(TRAKT_OAUTH_STATE_COOKIE)?.value;
  const searchParams = request.nextUrl.searchParams;
  const returnedState = searchParams.get("state");
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const redirectUrl =
    oauthError || !code || !expectedState || expectedState !== returnedState
      ? buildSettingsRedirect(
          "error",
          oauthError
            ? "Trakt authorization was cancelled or failed."
            : "Trakt authorization state was invalid. Please try again.",
        )
      : buildSettingsRedirect("success", "Trakt connected. Run a sync to import your history.");

  const response = redirectWithStateCleanup(redirectUrl);

  if (oauthError || !code || !expectedState || expectedState !== returnedState) {
    return response;
  }

  try {
    await linkTraktAccount({
      userId: user.userId,
      householdId: user.householdId,
      email: user.email,
      code,
    });
    return response;
  } catch (error) {
    return redirectWithStateCleanup(
      buildSettingsRedirect(
        "error",
        error instanceof Error ? error.message : "Unable to connect Trakt.",
      ),
    );
  }
}
