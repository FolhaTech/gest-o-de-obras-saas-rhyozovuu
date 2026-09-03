import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TrendingUp, TrendingDown, Scale, HelpCircle } from 'lucide-react'

interface WorkRoiBadgeProps {
  roiPercentage: number | null
  status?: 'positive' | 'negative' | 'neutral' | 'indeterminate'
  showIcon?: boolean
  tooltipText?: string
}

export function WorkRoiBadge({
  roiPercentage,
  status = 'indeterminate',
  showIcon = true,
  tooltipText,
}: WorkRoiBadgeProps) {
  if (roiPercentage === null) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="text-xs font-normal text-muted-foreground border-dashed bg-muted/40 cursor-help"
            >
              ROI: —
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[220px]">
            {tooltipText || 'Sem despesas ou orçamento registrado para calcular o ROI.'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  let colorClasses = 'bg-blue-50 text-blue-800 border-blue-200'
  let IconComponent = Scale

  if (roiPercentage > 0.01) {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
    IconComponent = TrendingUp
  } else if (roiPercentage < -0.01) {
    colorClasses = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400'
    IconComponent = TrendingDown
  }

  const defaultTooltip = `ROI: ${roiPercentage > 0 ? '+' : ''}${roiPercentage.toFixed(1)}% (${
    roiPercentage > 0
      ? 'Retorno Positivo'
      : roiPercentage < 0
        ? 'Déficit / Em recuperação'
        : 'Neutro'
  })`

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-xs font-semibold px-2 py-0.5 gap-1 inline-flex items-center cursor-help transition-colors ${colorClasses}`}
          >
            {showIcon && <IconComponent className="h-3 w-3 shrink-0" />}
            <span>
              ROI {roiPercentage > 0 ? '+' : ''}
              {roiPercentage.toFixed(1)}%
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs">{tooltipText || defaultTooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
