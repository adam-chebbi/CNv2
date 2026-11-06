#!/usr/bin/env node
// Café Noir — agent d'impression (amélioration 04).
//
// Runs on the register PC. Connects OUT to the Café Noir server with its token, fetches the tickets
// to print (kitchen, bar, register receipts, cash drawer) and sends them to the café's printers:
//   tcp://192.168.1.50:9100      network printer (raw port 9100)
//   file:///dev/usb/lp0          USB printer on Linux
//   share://localhost/Ticket     Windows shared printer (raw)
//
// Configuration: environment variables or agent-config.json next to this file
//   CN_SERVER_URL=https://system.cafenoir.tn   CN_AGENT_TOKEN=cnpa_…
// Start: node cn-print-agent.mjs   (install as a service: see agent/README.md)
// No dependency: Node.js 18+ only.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeDocument } from './escpos.mjs';

export const VERSION = '1.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));

const loadConfig = () => {
  let file = {};
  const configPath = path.join(here, 'agent-config.json');
  if (fs.existsSync(configPath)) file = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return {
    serverUrl: (process.env.CN_SERVER_URL ?? file.serverUrl ?? '').replace(/\/$/, ''),
    token: process.env.CN_AGENT_TOKEN ?? file.token ?? '',
    pollMs: Number(process.env.CN_POLL_MS ?? file.pollMs ?? 2000),
  };
};

const log = (...args) => console.log(new Date().toISOString(), ...args);

const api = async (config, method, route, body) => {
  const res = await fetch(`${config.serverUrl}/api/agent${route}`, {
    method,
    headers: { Authorization: `Bearer ${config.token}`, 'X-Agent-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${await res.text()}`);
  return res.json();
};

// Sends raw bytes to a printer address.
export const sendToPrinter = (address, bytes, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    if (address.startsWith('tcp://')) {
      const [host, port] = address.slice(6).split(':');
      const socket = net.createConnection({ host, port: Number(port || 9100) });
      socket.setTimeout(timeoutMs, () => socket.destroy(new Error('Imprimante injoignable (délai dépassé)')));
      socket.on('error', reject);
      socket.on('connect', () => socket.end(bytes));
      socket.on('close', (hadError) => !hadError && resolve());
    } else if (address.startsWith('file://')) {
      fs.writeFile(address.slice(7), bytes, (err) => (err ? reject(err) : resolve()));
    } else if (address.startsWith('share://')) {
      // \\host\SharedPrinter — Windows raw printer share
      const unc = `\\\\${address.slice(8).replace(/\//g, '\\')}`;
      fs.writeFile(unc, bytes, (err) => (err ? reject(err) : resolve()));
    } else reject(new Error(`Adresse non prise en charge : ${address}`));
  });

const probe = (address) =>
  new Promise((resolve) => {
    if (!address.startsWith('tcp://')) return resolve('ok');
    const [host, port] = address.slice(6).split(':');
    const socket = net.createConnection({ host, port: Number(port || 9100) });
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve('injoignable');
    });
    socket.on('error', () => resolve('injoignable'));
    socket.on('connect', () => {
      socket.end();
      resolve('ok');
    });
  });

// One pass: fetch jobs, print them, acknowledge. Exported for the automated tests.
export const runOnce = async (config) => {
  const { printers } = await api(config, 'GET', '/config');
  const byId = new Map(printers.map((p) => [p.id, p]));
  const jobs = await api(config, 'GET', '/jobs');
  for (const job of jobs) {
    const printer = byId.get(job.printerId);
    try {
      if (!printer) throw new Error('Imprimante inconnue pour cet agent');
      const bytes = encodeDocument(job.document, { paperWidth: printer.paperWidth });
      for (let i = 0; i < Math.max(1, job.copies); i++) await sendToPrinter(printer.address, bytes);
      await api(config, 'POST', `/jobs/${job.id}/done`, {});
      log('Imprimé', job.kind, job.document.title ?? '', '→', printer.name);
    } catch (err) {
      log('Échec', job.kind, job.document?.title ?? '', String(err?.message ?? err));
      await api(config, 'POST', `/jobs/${job.id}/failed`, { error: String(err?.message ?? err).slice(0, 400) }).catch(() => undefined);
    }
  }
  return jobs.length;
};

const reportStatus = async (config) => {
  const { printers } = await api(config, 'GET', '/config');
  const statuses = await Promise.all(printers.map(async (p) => ({ id: p.id, status: await probe(p.address) })));
  await api(config, 'POST', '/status', { printers: statuses });
};

const main = async () => {
  const config = loadConfig();
  if (!config.serverUrl || !config.token) {
    console.error('Configurez CN_SERVER_URL et CN_AGENT_TOKEN (ou agent-config.json).');
    process.exit(1);
  }
  log(`Agent d'impression Café Noir ${VERSION} — ${config.serverUrl}`);
  let lastStatus = 0;
  for (;;) {
    try {
      await runOnce(config);
      if (Date.now() - lastStatus > 15_000) {
        await reportStatus(config);
        lastStatus = Date.now();
      }
    } catch (err) {
      log('Serveur injoignable :', String(err?.message ?? err));
    }
    await new Promise((r) => setTimeout(r, config.pollMs));
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
