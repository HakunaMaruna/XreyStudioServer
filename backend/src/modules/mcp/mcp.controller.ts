import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpGuard } from './mcp.guard';
import { McpService } from './mcp.service';

@Controller('mcp')
@UseGuards(McpGuard)
export class McpController {
  constructor(private readonly service: McpService) {}

  private async handle(req: any, res: any, body: any) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.service.createServer();
    res.once('close', () => {
      void server.close().catch(() => undefined);
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  @Post()
  async post(@Req() req: any, @Res() res: any, @Body() body: any) {
    await this.handle(req, res, body);
  }

  @Get()
  async get(@Req() req: any, @Res() res: any) {
    await this.handle(req, res, undefined);
  }

  @Delete()
  async remove(@Req() req: any, @Res() res: any) {
    await this.handle(req, res, undefined);
  }
}
