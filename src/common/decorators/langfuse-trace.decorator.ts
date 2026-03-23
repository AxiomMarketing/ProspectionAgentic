import { SetMetadata } from '@nestjs/common';

export const LANGFUSE_TRACE_KEY = 'langfuseTrace';
export const LangfuseTrace = (name: string) => SetMetadata(LANGFUSE_TRACE_KEY, name);
