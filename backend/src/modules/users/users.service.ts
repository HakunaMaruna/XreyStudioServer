import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  private users: any[] = [];

  findAll(page = 1, limit = 20) {
    const start = (page - 1) * limit;
    return { data: this.users.slice(start, start + limit), total: this.users.length };
  }

  create(dto: any) {
    const user = { id: crypto.randomUUID(), ...dto, createdAt: new Date() };
    this.users.push(user);
    return user;
  }

  findOne(id: string) {
    return this.users.find((u) => u.id === id) || null;
  }

  update(id: string, dto: any) {
    const u = this.users.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, dto);
    return u;
  }

  remove(id: string) {
    this.users = this.users.filter((u) => u.id !== id);
    return { success: true };
  }
}
