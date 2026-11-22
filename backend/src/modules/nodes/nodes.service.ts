import { Injectable } from '@nestjs/common';

@Injectable()
export class NodesService {
  private nodes: any[] = [];

  findAll() {
    return this.nodes;
  }

  create(dto: any) {
    const node = { id: crypto.randomUUID(), status: 'OFFLINE', ...dto, createdAt: new Date() };
    this.nodes.push(node);
    return node;
  }

  findOne(id: string) {
    return this.nodes.find((n) => n.id === id) || null;
  }

  update(id: string, dto: any) {
    const n = this.nodes.find((x) => x.id === id);
    if (!n) return null;
    Object.assign(n, dto);
    return n;
  }

  remove(id: string) {
    this.nodes = this.nodes.filter((n) => n.id !== id);
    return { success: true };
  }

  health(id: string) {
    const n = this.findOne(id);
    if (!n) return null;
    return { nodeId: id, status: n.status, lastSeen: n.lastSeenAt || null };
  }
}
