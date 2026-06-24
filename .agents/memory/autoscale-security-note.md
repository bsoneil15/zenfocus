# Autoscale security note

When reviewing public autoscaled deployments, treat in-memory per-process rate limits as soft throttles rather than real abuse prevention. Security-sensitive or cost-bearing operations need durable, shared controls if they are meant to resist coordinated abuse across instances or cold starts.