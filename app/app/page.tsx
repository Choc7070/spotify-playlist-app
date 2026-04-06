"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Music2, RefreshCw, LogIn, LogOut, Search, Plus, AlertCircle } from "lucide-react";
const Card = ({ children, className = "" }) => <div className={`border bg-white ${className}`}>{children}</div>;
const CardHeader = ({ children, className = "" }) => <div className={className}>{children}</div>;
const CardContent = ({ children, className = "" }) => <div className={className}>{children}</div>;
const CardTitle = ({ children, className = "" }) => <h2 className={className}>{children}</h2>;
const Button = ({ children, className = "", variant, ...props }) => {
  const styles =
    variant === "outline"
      ? "border bg-white text-black"
      : "bg-black text-white border-black";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
};
const Input = ({ className = "", ...props }) => (
  <input {...props} className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${className}`} />
);
const Checkbox = ({ checked, onCheckedChange }) => (
  <input type="checkbox" checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} className="h-4 w-4" />
);
const Badge = ({ children, className = "", variant }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs ${variant === "default" ? "bg-black text-white" : "bg-gray-50 text-black"} ${className}`}
  >
    {children}
  </span>
);

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  values.forEach((v) => {
    result += chars[v % chars.length];
  });
  return result;
}

function parseHashOrSearchToken() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("access_token") || search.get("access_token");
}

function extractTrackUri(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("spotify:track:")) return trimmed;

  const urlMatch = trimmed.match(/track\/([A-Za-z0-9]+)/);
  if (urlMatch?.[1]) return `spotify:track:${urlMatch[1]}`;

  const plainIdMatch = trimmed.match(/^[A-Za-z0-9]{22}$/);
  if (plainIdMatch) return `spotify:track:${trimmed}`;

  return null;
}

async function apiFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Spotify API error: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function fetchAllPlaylists(token) {
  let url = "https://api.spotify.com/v1/me/playlists?limit=50";
  const all = [];

  while (url) {
    const data = await apiFetch(url, token);
    all.push(...(data.items || []));
    url = data.next;
  }

  return all;
}

async function checkSavedPlaylists(token, playlistIds) {
  const chunks = [];
  for (let i = 0; i < playlistIds.length; i += 50) {
    chunks.push(playlistIds.slice(i, i + 50));
  }

  const flags = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams();
    params.set("ids", chunk.join(","));
    params.set("type", "playlist");
    const data = await apiFetch(`https://api.spotify.com/v1/me/library/contains?${params.toString()}`, token);
    flags.push(...data);
  }

  return flags;
}

async function addTrackToPlaylist(token, playlistId, trackUri) {
  return apiFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, token, {
    method: "POST",
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

export default function SpotifyPlaylistBulkShareApp() {
  const [token, setToken] = useState("");
  const [playlists, setPlaylists] = useState([]);
  const [selectedIds, setSelectedIds] = useState({});
  const [trackInput, setTrackInput] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("spotify_access_token");
    const urlToken = parseHashOrSearchToken();

    if (urlToken) {
      localStorage.setItem("spotify_access_token", urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      setLoading(true);
      setError("");
      setStatus("Loading your Spotify profile and playlists...");
      try {
        const me = await apiFetch("https://api.spotify.com/v1/me", token);
        setProfile(me);

        const playlistItems = await fetchAllPlaylists(token);
        const ids = playlistItems.map((p) => p.id);

        let savedFlags = [];
        try {
          savedFlags = await checkSavedPlaylists(token, ids);
        } catch (e) {
          savedFlags = ids.map(() => null);
        }

        const merged = playlistItems.map((playlist, index) => ({
          ...playlist,
          savedByYou: savedFlags[index],
        }));

        setPlaylists(merged);
        setStatus(`Loaded ${merged.length} playlists.`);
      } catch (e) {
        setError("Could not load Spotify data. Check your Client ID, redirect URI, and app settings in Spotify Developer Dashboard.");
        setStatus("");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  const filteredPlaylists = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return playlists;
    return playlists.filter((p) => {
      const owner = p.owner?.display_name || p.owner?.id || "";
      return [p.name, owner].some((value) => (value || "").toLowerCase().includes(term));
    });
  }, [playlists, filter]);

  const selectedPlaylistIds = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([id]) => id),
    [selectedIds]
  );

  const totalFollowers = useMemo(
    () => playlists.reduce((sum, p) => sum + (p.followers?.total || 0), 0),
    [playlists]
  );

  async function login() {
    setError("");
    try {
      const verifier = randomString(64);
            await sha256(verifier);
      localStorage.setItem("spotify_code_verifier", verifier);

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "token",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        show_dialog: "true",
      });

      window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
    } catch (e) {
      setError(CLIENT_ID ? "Spotify login could not start." : "Add NEXT_PUBLIC_SPOTIFY_CLIENT_ID in your deployment settings first.");
    }
  }

  function logout() {
    localStorage.removeItem("spotify_access_token");
    setToken("");
    setPlaylists([]);
    setSelectedIds({});
    setProfile(null);
    setStatus("Logged out.");
  }

  function togglePlaylist(id, checked) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  }

  function selectAllFiltered() {
    const next = { ...selectedIds };
    filteredPlaylists.forEach((p) => {
      next[p.id] = true;
    });
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds({});
  }

  async function addTrackToSelectedPlaylists() {
    const trackUri = extractTrackUri(trackInput);
    if (!trackUri) {
      setError("Paste a valid Spotify track link, URI, or 22-character track ID.");
      return;
    }

    if (!selectedPlaylistIds.length) {
      setError("Select at least one playlist first.");
      return;
    }

    setAdding(true);
    setError("");
    setStatus(`Adding ${trackUri} to ${selectedPlaylistIds.length} playlist(s)...`);

    const results = [];
    for (const playlistId of selectedPlaylistIds) {
      const playlist = playlists.find((p) => p.id === playlistId);
      try {
        await addTrackToPlaylist(token, playlistId, trackUri);
        results.push({ playlist: playlist?.name || playlistId, ok: true });
      } catch (e) {
        results.push({ playlist: playlist?.name || playlistId, ok: false, error: e.message });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.length - successCount;

    if (failCount === 0) {
      setStatus(`Done. Added the track to ${successCount} playlist(s).`);
    } else {
      setStatus(`Finished with ${successCount} success(es) and ${failCount} failure(s). Some playlists may be read-only or not owned by you.`);
    }
  
    setAdding(false);
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Music2 className="h-7 w-7" />
                Spotify Playlist Bulk Share
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Count your playlists, view follower totals, select the playlists you want, and add one Spotify track to many selected playlists in one click.
              </p>
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <strong>Setup:</strong> add <code>NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> in your hosting environment and add your live site URL as a Spotify redirect URI. This app uses Spotify Web API scopes for reading playlists and modifying playlists.
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {!token ? (
                <Button onClick={login} className="rounded-2xl">
                  <LogIn className="mr-2 h-4 w-4" />
                  Connect Spotify
                </Button>
              ) : (
                <>
                  <Button onClick={() => window.location.reload()} variant="outline" className="rounded-2xl">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                  <Button onClick={logout} variant="outline" className="rounded-2xl">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </Button>
                </>
              )}

              {profile && (
                <Badge variant="secondary" className="rounded-xl px-3 py-1 text-sm">
                  Signed in as {profile.display_name || profile.id}
                </Badge>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span>Total playlists</span>
                  <strong>{playlists.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span>Total playlist followers</span>
                  <strong>{totalFollowers.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span>Selected playlists</span>
                  <strong>{selectedPlaylistIds.length}</strong>
                </div>
                <div className="text-xs text-muted-foreground">
                  Note: Spotify exposes a playlist follower total, but not a separate public save count for playlists.
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Bulk add a track to selected playlists</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={trackInput}
                  onChange={(e) => setTrackInput(e.target.value)}
                  placeholder="Paste Spotify track URL, URI, or track ID"
                  className="rounded-xl"
                />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={addTrackToSelectedPlaylists} disabled={!token || adding} className="rounded-2xl">
                    <Plus className="mr-2 h-4 w-4" />
                    {adding ? "Adding..." : "Add to selected playlists"}
                  </Button>
                  <Button onClick={selectAllFiltered} variant="outline" className="rounded-2xl">
                    Select filtered
                  </Button>
                  <Button onClick={clearSelection} variant="outline" className="rounded-2xl">
                    Clear selection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-lg">Your playlists</CardTitle>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter playlists"
                    className="rounded-xl pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {filteredPlaylists.map((playlist) => (
                  <div key={playlist.id} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[auto,1fr,auto,auto,auto] md:items-center">
                    <Checkbox
                      checked={!!selectedIds[playlist.id]}
                      onCheckedChange={(checked) => togglePlaylist(playlist.id, !!checked)}
                    />
                    <div>
                      <div className="font-medium">{playlist.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Owner: {playlist.owner?.display_name || playlist.owner?.id || "Unknown"}
                      </div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl px-3 py-1">
                      Tracks: {playlist.tracks?.total ?? 0}
                    </Badge>
                    <Badge variant="secondary" className="rounded-xl px-3 py-1">
                      Followers: {playlist.followers?.total?.toLocaleString?.() ?? 0}
                    </Badge>
                  </div>
                ))}

                {!loading && !filteredPlaylists.length && (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No playlists found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {(status || error || loading) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="flex items-start gap-3 p-4 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  {loading && <div>Working...</div>}
                  {status && <div>{status}</div>}
                  {error && <div className="mt-1 text-destructive">{error}</div>}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
