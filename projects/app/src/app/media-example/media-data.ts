/**
 * Media library data — pure constants. Curated Blender Open Movies: official,
 * embeddable, CC-licensed, so the demo needs NO YouTube Data API key (the
 * player is the key-less IFrame embed; only playback talks to YouTube).
 */

export interface MediaCategory {
  readonly kind: 'category';
  readonly id: string;
  readonly name: string;
  readonly children: readonly MediaNode[];
}

export interface MediaVideo {
  readonly kind: 'video';
  readonly id: string;
  readonly name: string;
  /** YouTube video id — what the IFrame player loads. */
  readonly videoId: string;
  readonly duration: string;
}

export type MediaNode = MediaCategory | MediaVideo;

export const isCategory = (node: MediaNode): node is MediaCategory =>
  node.kind === 'category';

/**
 * Pulls the 11-char video id out of the common YouTube URL shapes
 * (`watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `/v/`), or `null` if it isn't
 * one. Simple by design — a paste-box validator, not a spec-complete parser.
 */
export function parseYouTubeId(url: string): string | null {
  const match = url
    .trim()
    .match(
      /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    );
  return match ? match[1] : null;
}

export const MEDIA_LIBRARY: readonly MediaNode[] = [
  {
    kind: 'category',
    id: 'open-movies',
    name: 'Blender Open Movies',
    children: [
      {
        kind: 'category',
        id: 'classics',
        name: 'The Classics (2006–2012)',
        children: [
          {
            kind: 'video',
            id: 'ed',
            name: 'Elephants Dream',
            videoId: 'TLkA0RELQ1g',
            duration: '10:53',
          },
          {
            kind: 'video',
            id: 'bbb',
            name: 'Big Buck Bunny',
            videoId: 'aqz-KE-bpKQ',
            duration: '9:56',
          },
          {
            kind: 'video',
            id: 'sintel',
            name: 'Sintel',
            videoId: 'eRsGyueVLvQ',
            duration: '14:48',
          },
          {
            kind: 'video',
            id: 'tos',
            name: 'Tears of Steel',
            videoId: 'R6MlUcmOul8',
            duration: '12:14',
          },
        ],
      },
      {
        kind: 'category',
        id: 'new-wave',
        name: 'The New Wave (2015–2022)',
        children: [
          {
            kind: 'video',
            id: 'cosmos',
            name: 'Cosmos Laundromat',
            videoId: 'Y-rmzh0PI3c',
            duration: '12:10',
          },
          {
            kind: 'video',
            id: 'spring',
            name: 'Spring',
            videoId: 'WhWc3b3KhnY',
            duration: '7:44',
          },
          {
            kind: 'video',
            id: 'coffee',
            name: 'Coffee Run',
            videoId: 'PVGeM40dABA',
            duration: '2:59',
          },
          {
            kind: 'video',
            id: 'charge',
            name: 'Charge',
            videoId: 'UXqq0ZvbOnk',
            duration: '3:54',
          },
        ],
      },
    ],
  },
  {
    kind: 'category',
    id: 'new-releases',
    name: 'New Releases',
    children: [
      // Rickroll Easter egg 🎸 — the "trailer" loads Never Gonna Give You Up.
      {
        kind: 'video',
        id: 'spidey',
        name: 'Spider-Man: Brand New Dawn — Official Trailer',
        videoId: 'dQw4w9WgXcQ',
        duration: '3:33',
      },
    ],
  },
];

/** Every category id — the library opens fully expanded (playlist convention). */
export function categoryIds(nodes: readonly MediaNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly MediaNode[]) => {
    for (const node of list) {
      if (isCategory(node)) {
        ids.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/** All videos in DFS order — the playlist the auto-advance walks. */
export function flattenVideos(nodes: readonly MediaNode[]): MediaVideo[] {
  return nodes.flatMap((node) =>
    isCategory(node) ? flattenVideos(node.children) : [node],
  );
}

/** The video after `currentId` in DFS order, wrapping at the end (endless playlist). */
export function nextVideo(
  nodes: readonly MediaNode[],
  currentId: string,
): MediaVideo | null {
  const videos = flattenVideos(nodes);
  if (videos.length === 0) return null;
  const index = videos.findIndex((video) => video.id === currentId);
  return videos[(index + 1) % videos.length];
}
