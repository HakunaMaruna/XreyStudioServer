import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  SNAPSHOT_BEFORE_KEY,
  SnapshotBeforeMetadata,
} from './snapshot-before.decorator';
import { SnapshotsService } from './snapshots.service';

interface HttpRequestWithUser {
  method?: string;
  user?: AuthUser;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class SnapshotBeforeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly snapshots: SnapshotsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const metadata = this.reflector.getAllAndOverride<SnapshotBeforeMetadata>(SNAPSHOT_BEFORE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<HttpRequestWithUser>();
    if (!request.method || !MUTATING_METHODS.has(request.method)) return next.handle();

    await this.snapshots.beforeChange(metadata.kind, metadata.reason, request.user?.userId);
    return next.handle();
  }
}
