'use client'

import { AgentConfig } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Building2, Users, Heart, Briefcase } from 'lucide-react'
import { toneLabel } from '@/lib/company'

export default function CompanyContextCard({ config }: { config: AgentConfig }) {
  const { companyContext, targetRole } = config

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Company</span>
        {companyContext.source && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {companyContext.source}
          </Badge>
        )}
      </div>

      <div>
        <p className="font-medium">{companyContext.name}</p>
        <p className="text-sm text-muted-foreground">{companyContext.industry}</p>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
        {companyContext.description}
      </p>

      {companyContext.mission && (
        <p className="text-sm text-muted-foreground italic border-l-2 border-border pl-3">
          {companyContext.mission}
        </p>
      )}

      {companyContext.culture.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {companyContext.culture.slice(0, 5).map(c => (
            <Badge key={c} variant="outline" className="text-xs font-normal">{c}</Badge>
          ))}
        </div>
      )}

      {companyContext.values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {companyContext.values.slice(0, 4).map(v => (
            <Badge key={v} variant="outline" className="text-xs font-normal">
              <Heart className="w-3 h-3 mr-1" />{v}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-3 border-t border-border">
        {companyContext.companySize && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {companyContext.companySize}
          </span>
        )}
        <span>Tone: {toneLabel(companyContext.tone)}</span>
        {targetRole && (
          <span className="flex items-center gap-1">
            <Briefcase className="w-3 h-3" /> {targetRole}
          </span>
        )}
      </div>
    </div>
  )
}
