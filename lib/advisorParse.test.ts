import { describe, it, expect } from 'vitest'
import {
  extractGoalData,
  extractDeleteGoal,
  extractCheckIn,
  extractAppEdit,
  extractTrackerCreate,
  extractTrackerUpdate,
  extractTrackerDelete,
  stripTags,
} from './advisorParse'

describe('extractCheckIn', () => {
  it('parses a single-goal check-in', () => {
    const text = 'Nice work today!\n<check_in>[{"goal_id":"g1","notes":"did 3 parts"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([{ goal_id: 'g1', notes: 'did 3 parts' }])
  })
  it('parses a multi-goal check-in', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"a"},{"goal_id":"g2","notes":"b"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([
      { goal_id: 'g1', notes: 'a' },
      { goal_id: 'g2', notes: 'b' },
    ])
  })
  it('returns null when no tag present', () => {
    expect(extractCheckIn('just a normal reply')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(extractCheckIn('<check_in>[not json]</check_in>')).toBeNull()
  })
  it('returns null on an empty array', () => {
    expect(extractCheckIn('<check_in>[]</check_in>')).toBeNull()
  })
  it('drops malformed entries and keeps well-formed ones', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"ok"},"junk",{"notes":"no id"},{"goal_id":"g2","notes":"ok2"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([
      { goal_id: 'g1', notes: 'ok' },
      { goal_id: 'g2', notes: 'ok2' },
    ])
  })
  it('returns null when every entry is malformed', () => {
    expect(extractCheckIn('<check_in>[1, 2, {"goal_id":5}]</check_in>')).toBeNull()
  })
})

describe('extractGoalData', () => {
  it('parses goal data', () => {
    const text = '<goal_data>{"type":"continuous","title":"Calc","description":"d","deadline":"2026-08-31"}</goal_data>'
    expect(extractGoalData(text)).toEqual({
      type: 'continuous',
      title: 'Calc',
      description: 'd',
      deadline: '2026-08-31',
    })
  })
  it('returns null when absent', () => {
    expect(extractGoalData('hi')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(extractGoalData('<goal_data>{bad}</goal_data>')).toBeNull()
  })
})

describe('extractDeleteGoal', () => {
  it('parses delete goal', () => {
    expect(extractDeleteGoal('<delete_goal>{"id":"g1","title":"Calc"}</delete_goal>')).toEqual({
      id: 'g1',
      title: 'Calc',
    })
  })
  it('returns null when absent', () => {
    expect(extractDeleteGoal('hi')).toBeNull()
  })
})

describe('stripTags', () => {
  it('strips goal_data', () => {
    expect(stripTags('Before <goal_data>{"x":1}</goal_data> after')).toBe('Before  after')
  })
  it('strips check_in', () => {
    expect(stripTags('Logged it!\n<check_in>[{"goal_id":"g1","notes":"x"}]</check_in>')).toBe('Logged it!')
  })
  it('strips delete_goal', () => {
    expect(stripTags('Sure. <delete_goal>{"id":"g1","title":"C"}</delete_goal>')).toBe('Sure.')
  })
  it('strips multiple tag types and trims', () => {
    const text = '  Done <check_in>[{"goal_id":"g1","notes":"x"}]</check_in> <goal_data>{"a":1}</goal_data>  '
    expect(stripTags(text)).toBe('Done')
  })
})

describe('extractTrackerCreate', () => {
  it('parses a tracker list', () => {
    const text =
      'Setting these up.\n<tracker_create>[{"goal_id":"g1","name":"Module 21","kind":"steps","total":22}]</tracker_create>'
    expect(extractTrackerCreate(text)).toEqual([
      { goal_id: 'g1', name: 'Module 21', kind: 'steps', total: 22 },
    ])
  })
  it('accepts step_labels in place of total', () => {
    const text =
      '<tracker_create>[{"goal_id":"g1","name":"Units","kind":"steps","step_labels":["a","b"]}]</tracker_create>'
    expect(extractTrackerCreate(text)).toEqual([
      { goal_id: 'g1', name: 'Units', kind: 'steps', step_labels: ['a', 'b'] },
    ])
  })
  it('drops malformed entries, null when all malformed or no tag', () => {
    const text =
      '<tracker_create>[{"goal_id":"g1","name":"ok","kind":"counter","total":5},{"kind":"counter"}]</tracker_create>'
    expect(extractTrackerCreate(text)).toEqual([
      { goal_id: 'g1', name: 'ok', kind: 'counter', total: 5 },
    ])
    expect(extractTrackerCreate('<tracker_create>[{"kind":"x"}]</tracker_create>')).toBeNull()
    expect(extractTrackerCreate('no tag')).toBeNull()
    expect(extractTrackerCreate('<tracker_create>nope</tracker_create>')).toBeNull()
  })
  it('rejects steps entries with neither total nor step_labels', () => {
    expect(
      extractTrackerCreate('<tracker_create>[{"goal_id":"g1","name":"x","kind":"steps"}]</tracker_create>')
    ).toBeNull()
    expect(
      extractTrackerCreate('<tracker_create>[{"goal_id":"g1","name":"x","kind":"steps","step_labels":[1,2]}]</tracker_create>')
    ).toBeNull()
  })
})

describe('extractTrackerUpdate', () => {
  it('parses updates', () => {
    const text = 'Logged!\n<tracker_update>[{"tracker_id":"t1","current":13}]</tracker_update>'
    expect(extractTrackerUpdate(text)).toEqual([{ tracker_id: 't1', current: 13 }])
  })
  it('drops entries without a numeric current or string id', () => {
    const text =
      '<tracker_update>[{"tracker_id":"t1","current":"13"},{"tracker_id":"t2","current":4}]</tracker_update>'
    expect(extractTrackerUpdate(text)).toEqual([{ tracker_id: 't2', current: 4 }])
  })
  it('returns null when absent or malformed', () => {
    expect(extractTrackerUpdate('hi')).toBeNull()
    expect(extractTrackerUpdate('<tracker_update>{}</tracker_update>')).toBeNull()
  })
})

describe('extractTrackerDelete', () => {
  it('parses a delete', () => {
    expect(
      extractTrackerDelete('<tracker_delete>{"id":"t1","name":"Module 21"}</tracker_delete>')
    ).toEqual({ id: 't1', name: 'Module 21' })
  })
  it('returns null when absent or malformed', () => {
    expect(extractTrackerDelete('hi')).toBeNull()
    expect(extractTrackerDelete('<tracker_delete>nope</tracker_delete>')).toBeNull()
  })
})

describe('stripTags (tracker tags)', () => {
  it('removes all three tracker tags', () => {
    const text =
      'Before <tracker_create>[1]</tracker_create> mid <tracker_update>[2]</tracker_update> and <tracker_delete>{}</tracker_delete> after'
    expect(stripTags(text)).toBe('Before  mid  and  after')
  })
})

describe('extractAppEdit', () => {
  it('parses summary + ops', () => {
    const text =
      'Here is the plan.\n<app_edit>{"summary":"Delete pre-season tasks","ops":[{"op":"task_delete","goal_id":null,"from":"2026-06-10","to":"2026-06-14"}]}</app_edit>'
    expect(extractAppEdit(text)).toEqual({
      summary: 'Delete pre-season tasks',
      ops: [{ op: 'task_delete', goal_id: null, from: '2026-06-10', to: '2026-06-14' }],
    })
  })
  it('returns null when absent, malformed, missing summary, or empty ops', () => {
    expect(extractAppEdit('no tag')).toBeNull()
    expect(extractAppEdit('<app_edit>not json</app_edit>')).toBeNull()
    expect(extractAppEdit('<app_edit>{"ops":[{"op":"light_day"}]}</app_edit>')).toBeNull()
    expect(extractAppEdit('<app_edit>{"summary":"x","ops":[]}</app_edit>')).toBeNull()
  })
})

describe('extractCheckIn done flag', () => {
  it('passes done through when boolean', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"finished today","done":true}]</check_in>'
    expect(extractCheckIn(text)).toEqual([{ goal_id: 'g1', notes: 'finished today', done: true }])
  })
  it('drops a non-boolean done', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"x","done":"yes"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([{ goal_id: 'g1', notes: 'x' }])
  })
})

describe('stripTags (app_edit)', () => {
  it('removes the app_edit tag', () => {
    expect(stripTags('Before <app_edit>{"summary":"x","ops":[1]}</app_edit> after')).toBe('Before  after')
  })
})
