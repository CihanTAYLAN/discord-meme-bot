import { describe, expect, it } from 'vitest'

class SimpleQueue<T> {
  readonly values: T[] = []

  enqueue(value: T) {
    this.values.push(value)
  }

  drain() {
    return this.values.shift()
  }
}

describe('FIFO queue behavior', () => {
  it('dequeues values in insertion order', () => {
    const queue = new SimpleQueue<string>()
    queue.enqueue('first')
    queue.enqueue('second')

    expect(queue.drain()).toBe('first')
    expect(queue.drain()).toBe('second')
  })
})
