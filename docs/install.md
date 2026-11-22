# Installation Guide

## Requirements
- Ubuntu/Debian
- Docker + Docker Compose

## Modes
- panel: panel only
- node: agent + Xray
- subscription: subscription page only
- all-in-one: everything

## Steps
1. Copy `.env.example` to `.env`
2. Run `./install.sh <mode> <domain>`
3. Open `https://<domain>`

## Makefile
- `make install`, `make up`, `make down`, `make logs`, `make update`, `make backup`, `make restore`