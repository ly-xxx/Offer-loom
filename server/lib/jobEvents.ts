type JobSnapshot = {
  id: string
} & Record<string, unknown>

type JobListener = (job: JobSnapshot) => void

class JobEventHub {
  private readonly globalListeners = new Set<JobListener>()
  private readonly scopedListeners = new Map<string, Set<JobListener>>()

  publish(job: JobSnapshot) {
    for (const listener of this.globalListeners) {
      listener(job)
    }

    const scoped = this.scopedListeners.get(job.id)
    if (!scoped) {
      return
    }

    for (const listener of scoped) {
      listener(job)
    }
  }

  subscribe(listener: JobListener) {
    this.globalListeners.add(listener)
    return () => {
      this.globalListeners.delete(listener)
    }
  }

  subscribeJob(jobId: string, listener: JobListener) {
    const scoped = this.scopedListeners.get(jobId) ?? new Set<JobListener>()
    scoped.add(listener)
    this.scopedListeners.set(jobId, scoped)

    return () => {
      const current = this.scopedListeners.get(jobId)
      if (!current) {
        return
      }
      current.delete(listener)
      if (current.size === 0) {
        this.scopedListeners.delete(jobId)
      }
    }
  }
}

export const jobEvents = new JobEventHub()
