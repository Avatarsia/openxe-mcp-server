import { createHash, randomBytes } from "node:crypto";

interface DigestChallenge {
  realm: string;
  nonce: string;
  opaque: string;
  qop: string;
}

export class DigestAuth {
  private username: string;
  private password: string;
  private challenge: DigestChallenge | null = null;
  private nonceCount = 0;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  hasChallenge(): boolean {
    return this.challenge !== null;
  }

  parseChallenge(header: string): DigestChallenge {
    const parts: Record<string, string> = {};
    const regex = /(\w+)=(?:"([^"]+)"|(\S+))/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(header)) !== null) {
      parts[match[1]] = match[2] ?? match[3];
    }
    this.challenge = {
      realm: parts.realm ?? "",
      nonce: parts.nonce ?? "",
      opaque: parts.opaque ?? "",
      qop: parts.qop ?? "auth",
    };
    this.nonceCount = 0;
    return this.challenge;
  }

  generateHeader(method: string, uri: string): string {
    if (!this.challenge) throw new Error("No digest challenge available");
    this.nonceCount++;
    const nc = this.nonceCount.toString(16).padStart(8, "0");
    const cnonce = randomBytes(8).toString("hex");
    const ha1 = this.md5(`${this.username}:${this.challenge.realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = this.md5(`${ha1}:${this.challenge.nonce}:${nc}:${cnonce}:${this.challenge.qop}:${ha2}`);
    return [
      `Digest username="${this.username}"`,
      `realm="${this.challenge.realm}"`,
      `nonce="${this.challenge.nonce}"`,
      `uri="${uri}"`,
      `qop=${this.challenge.qop}`,
      `nc=${nc}`,
      `cnonce="${cnonce}"`,
      `response="${response}"`,
      `opaque="${this.challenge.opaque}"`,
    ].join(", ");
  }

  private md5(input: string): string {
    return createHash("md5").update(input).digest("hex");
  }
}
