{{- define "xrey.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "xrey.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "xrey.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "xrey.labels" -}}
helm.sh/chart: {{ include "xrey.chart" . }}
{{ include "xrey.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "xrey.selectorLabels" -}}
app.kubernetes.io/name: {{ include "xrey.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "xrey.image" -}}
{{- printf "%s:%s" .repository .tag -}}
{{- end -}}

{{- define "xrey.databaseUrl" -}}
{{- printf "postgres://%s:$(POSTGRES_PASSWORD)@%s-postgres:5432/%s" .Values.config.postgresUser (include "xrey.fullname" .) .Values.config.postgresDb -}}
{{- end -}}

{{- define "xrey.redisUrl" -}}
{{- printf "redis://%s-redis:6379" (include "xrey.fullname" .) -}}
{{- end -}}

{{- define "xrey.secretRef" -}}
{{- $key := index .Values.secretKeys .key -}}
{{ if has $key .Values.optionalSecretKeys }}optional: true
{{ end }}name: {{ .Values.existingSecret }}
key: {{ $key }}
{{- end -}}
