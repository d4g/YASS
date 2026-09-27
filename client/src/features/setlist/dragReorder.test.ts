import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { dropIndex, reorder, type RowBox } from './dragReorder'

/** Five 60px rows, stacked from the top of the list. */
const rows: RowBox[] = [0, 60, 120, 180, 240].map((top) => ({ top, height: 60 }))

describe('dropIndex', () => {
  it('swaps once the leading edge crosses a neighbour’s middle', () => {
    assert.equal(dropIndex(rows, 1, 60 + 29, 0, 4), 1)
    assert.equal(dropIndex(rows, 1, 60 + 31, 0, 4), 2)
    assert.equal(dropIndex(rows, 1, 60 - 31, 0, 4), 0)
  })

  it('passes several rows in one move', () => {
    assert.equal(dropIndex(rows, 0, 200, 0, 4), 3)
    assert.equal(dropIndex(rows, 4, 10, 0, 4), 0)
  })

  it('never lands among the rows a show has already played', () => {
    // Rows 0 and 1 are history; nothing may be dropped above row 2.
    assert.equal(dropIndex(rows, 3, 0, 2, 4), 2)
  })

  it('never goes past the end', () => {
    assert.equal(dropIndex(rows, 2, 999, 0, 4), 4)
  })
})

describe('reorder', () => {
  it('moves one item and keeps the rest in order', () => {
    assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd'])
    assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c'])
    assert.deepEqual(reorder(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c'])
  })

  it('leaves the original alone', () => {
    const list = ['a', 'b', 'c']
    reorder(list, 0, 2)
    assert.deepEqual(list, ['a', 'b', 'c'])
  })
})
