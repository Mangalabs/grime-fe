import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type {
  FactApprovalResult,
  FactStatus,
  LinterReport,
  Override,
  PendingFact,
  RegressionAlert,
  SceneSubmission,
  SlotReview,
} from '../../api/contracts'

export function useSceneReview(slotId: string) {
  const [report, setReport] = useState<LinterReport | null>(null)
  const [facts, setFacts] = useState<PendingFact[]>([])
  const [factStatus, setFactStatus] = useState<FactStatus>('NONE')
  const [overrides, setOverrides] = useState<Override[]>([])
  const [alerts, setAlerts] = useState<RegressionAlert[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDecidingFacts, setIsDecidingFacts] = useState(false)
  const [isLoadingResources, setIsLoadingResources] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approval, setApproval] = useState<FactApprovalResult | null>(null)
  const requestController = useRef<AbortController | null>(null)
  const resourceRequestId = useRef(0)

  const refreshResources = useCallback(async (requestedSlotId = slotId) => {
    if (!requestedSlotId) {
      return
    }

    const requestId = ++resourceRequestId.current
    setIsLoadingResources(true)
    try {
      const [nextOverrides, nextAlerts] = await Promise.all([
        api.listOverrides(requestedSlotId),
        api.listRegressionAlerts(requestedSlotId),
      ])
      if (requestId === resourceRequestId.current) {
        setOverrides(nextOverrides)
        setAlerts(nextAlerts)
      }
    } catch (reason) {
      if (requestId === resourceRequestId.current) {
        setError(errorMessage(reason))
      }
    } finally {
      if (requestId === resourceRequestId.current) {
        setIsLoadingResources(false)
      }
    }
  }, [slotId])

  useEffect(
    () => () => {
      requestController.current?.abort()
    },
    [],
  )

  const submit = useCallback(async (submission: SceneSubmission) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setIsSubmitting(true)
    setError(null)
    setApproval(null)

    try {
      const nextReport = await api.submitScene(submission, controller.signal)
      if (!controller.signal.aborted) {
        setReport(nextReport)
        setFacts(nextReport.pendingFacts)
        if (nextReport.autoApproval) {
          // Already canon: the panel shows them as approved, still editable.
          setFactStatus('APPROVED')
          setApproval({ slotId: nextReport.slotId, ...nextReport.autoApproval })
          void refreshResources(nextReport.slotId)
        } else {
          setFactStatus('PENDING')
        }
        if (nextReport.analysisErrors.length > 0) {
          setError(nextReport.analysisErrors.join(' '))
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(errorMessage(reason))
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false)
      }
    }
  }, [refreshResources])

  const approve = useCallback(async () => {
    if (!report) {
      return
    }

    const subjectiveFactWithoutClaim = facts.some(
      (fact) => fact.isSubjective && !fact.sourceClaim?.trim(),
    )
    if (subjectiveFactWithoutClaim) {
      setError('Todo fato subjetivo precisa identificar a alegação de origem.')
      return
    }

    setIsDecidingFacts(true)
    setError(null)
    try {
      const result = await api.approveFacts(report.slotId, facts)
      setApproval(result)
      setReport({ ...report, pendingFacts: facts })
      setFactStatus('APPROVED')
      await refreshResources()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsDecidingFacts(false)
    }
  }, [facts, refreshResources, report])

  const updateApprovedFact = useCallback(
    async (index: number, updatedFact: PendingFact) => {
      if (!report) {
        return
      }

      const nextFacts = facts.map((fact, factIndex) =>
        factIndex === index ? updatedFact : fact,
      )
      setIsDecidingFacts(true)
      setError(null)
      try {
        const result = await api.approveFacts(report.slotId, nextFacts)
        setFacts(nextFacts)
        setReport({ ...report, pendingFacts: nextFacts })
        setFactStatus('APPROVED')
        setApproval(result)
        await refreshResources()
      } catch (reason) {
        setError(errorMessage(reason))
        throw reason
      } finally {
        setIsDecidingFacts(false)
      }
    },
    [facts, refreshResources, report],
  )

  const reject = useCallback(async () => {
    if (!report) {
      return
    }

    setIsDecidingFacts(true)
    setError(null)
    try {
      await api.rejectFacts(report.slotId)
      setReport(null)
      setFacts([])
      setFactStatus('NONE')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsDecidingFacts(false)
    }
  }, [report])

  const saveOverride = useCallback(
    async (factViolatedId: string, justification: string) => {
      setError(null)
      try {
        const override = await api.saveOverride(
          slotId,
          factViolatedId,
          justification,
        )
        setOverrides((current) => [
          ...current.filter(
            (item) =>
              item.diagnosticSignatureHash !== override.diagnosticSignatureHash,
          ),
          override,
        ])
      } catch (reason) {
        setError(errorMessage(reason))
        throw reason
      }
    },
    [slotId],
  )

  const removeOverride = useCallback(
    async (signatureHash: string) => {
      setError(null)
      try {
        await api.removeOverride(slotId, signatureHash)
        setOverrides((current) =>
          current.filter((item) => item.diagnosticSignatureHash !== signatureHash),
        )
      } catch (reason) {
        setError(errorMessage(reason))
        throw reason
      }
    },
    [slotId],
  )

  const dismissDiagnostic = useCallback(
    async (signatureHash: string) => {
      setError(null)
      try {
        await api.dismissDiagnostic(slotId, signatureHash)
        setReport((current) =>
          current && {
            ...current,
            diagnostics: current.diagnostics.filter(
              (diagnostic) => diagnostic.signatureHash !== signatureHash,
            ),
          },
        )
        setOverrides((current) =>
          current.filter((item) => item.diagnosticSignatureHash !== signatureHash),
        )
      } catch (reason) {
        setError(errorMessage(reason))
        throw reason
      }
    },
    [slotId],
  )

  const acknowledgeAlert = useCallback(
    async (alertId: string) => {
      setError(null)
      try {
        const acknowledged = await api.acknowledgeAlert(slotId, alertId)
        setAlerts((current) =>
          current.map((alert) =>
            alert.id === alertId ? acknowledged : alert,
          ),
        )
      } catch (reason) {
        setError(errorMessage(reason))
      }
    },
    [slotId],
  )

  const resetReview = useCallback(() => {
    requestController.current?.abort()
    resourceRequestId.current += 1
    setReport(null)
    setFacts([])
    setFactStatus('NONE')
    setOverrides([])
    setAlerts([])
    setApproval(null)
    setError(null)
    setIsSubmitting(false)
    setIsLoadingResources(false)
  }, [])

  const loadReview = useCallback((slotId: string, review: SlotReview) => {
    setReport({
      slotId,
      diagnostics: review.diagnostics,
      pendingFacts: review.facts,
      analysisErrors: [],
    })
    setFacts(review.facts)
    setFactStatus(review.factStatus)
    setApproval(null)
    setError(null)
  }, [])

  return {
    report,
    facts,
    factStatus,
    overrides,
    alerts,
    error,
    approval,
    isSubmitting,
    isDecidingFacts,
    isLoadingResources,
    setFacts,
    submit,
    approve,
    updateApprovedFact,
    reject,
    saveOverride,
    removeOverride,
    dismissDiagnostic,
    acknowledgeAlert,
    refreshResources,
    resetReview,
    loadReview,
    clearError: () => setError(null),
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : 'Não foi possível concluir a solicitação.'
}
