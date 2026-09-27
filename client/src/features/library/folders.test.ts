/**
 * The folder filter: YARG's "Folder", which the song cache calls the playlist.
 *
 * Worth a test of its own because the name differs at every layer — `playlist`
 * on the song and in the sort key, `folders` in the filter state, `dir` in the
 * address — and a mismatch between any two would filter by nothing without a
 * word. `filterTokens.ts` stays out of reach, for the reason `sorting.test.ts`
 * gives: it loads `lib/sources.ts`, which only Vite can.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Song } from '@shared/types'
import { decodeAppState, DEFAULT_STATE, encodeAppState } from '../../lib/urlState'
import { EMPTY_FILTERS, filterSongs, panelFilterCount } from './filtering'

function song(id: string, playlist: string): Song {
  return {
    id,
    hash: null,
    name: id,
    artist: 'Artist',
    album: '',
    genre: '',
    subgenre: '',
    charter: '',
    playlist,
    source: '',
    year: '',
    yearNumber: null,
    lengthSeconds: null,
    albumTrack: null,
    addedAt: null,
    isMaster: true,
    ageRating: 'No Rating',
    vocalParts: 0,
    difficulties: {} as Song['difficulties'],
    bandDifficulty: null,
    format: 'Ini',
    hasArt: false,
    hasPreview: false,
  }
}

const library = [
  song('a', 'Rock Band 3'),
  song('b', 'Customs'),
  song('c', 'Unknown Playlist'),
  song('d', 'Customs'),
]

const ids = (songs: readonly Song[]) => songs.map((entry) => entry.id)

describe('filtering by folder', () => {
  it('keeps every song while no folder is picked', () => {
    assert.deepEqual(ids(filterSongs(library, EMPTY_FILTERS, 'band')), ['a', 'b', 'c', 'd'])
  })

  it('keeps the songs in any picked folder, YARG’s Unknown Playlist included', () => {
    const filters = { ...EMPTY_FILTERS, folders: ['Customs', 'Unknown Playlist'] }
    assert.deepEqual(ids(filterSongs(library, filters, 'band')), ['b', 'c', 'd'])
  })

  it('counts as one narrowing, however many folders are picked', () => {
    assert.equal(panelFilterCount({ ...EMPTY_FILTERS, folders: ['Customs', 'Rock Band 3'] }), 1)
  })
})

describe('the folder filter in the address', () => {
  it('survives a round trip, comma in a folder name and all', () => {
    const folders = ['Customs', 'Harmonix, DLC']
    const search = encodeAppState({ ...DEFAULT_STATE, filters: { ...EMPTY_FILTERS, folders } })

    assert.match(search, /[?&]dir=/)
    assert.deepEqual(decodeAppState(search).filters.folders, folders)
  })

  it('leaves no empty `dir=` behind when nothing is picked', () => {
    assert.doesNotMatch(encodeAppState(DEFAULT_STATE), /dir=/)
  })
})
