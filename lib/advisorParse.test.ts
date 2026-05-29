import { describe, it, expect } from 'vitest'
import { extractGoalData, extractDeleteGoal, extractCheckIn, stripTags } from './advisorParse'

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
