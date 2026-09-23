const { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } = require('crypto');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=') || 'true'];
  })
);

const clientName = args.get('client') || 'client6';
const alg = args.get('alg') || 'RS256';
const keySize = Number(args.get('key-size') || '2048');
const kid = args.get('kid') || `${clientName}-sig-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8)}`;
const outputDir = resolve(process.cwd(), args.get('out') || `.local/${clientName}`);
const privateJwksPath = resolve(outputDir, 'private_jwks.json');
const publicJwksPath = resolve(outputDir, 'jwks.json');

if (!/^(RS|PS)(256|384|512)$/.test(alg)) {
  throw new Error('--alg must be an RSA signing algorithm: RS256, RS384, RS512, PS256, PS384, or PS512');
}

if (!Number.isInteger(keySize) || keySize < 2048) {
  throw new Error('--key-size must be an integer >= 2048');
}

if (existsSync(privateJwksPath) || existsSync(publicJwksPath)) {
  throw new Error('Refusing to overwrite existing JWKS files. Use --out=<new-directory> to generate a separate key pair.');
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: keySize,
  publicExponent: 0x10001,
});

const privateJwk = privateKey.export({ format: 'jwk' });
privateJwk.kid = kid;
privateJwk.use = 'sig';
privateJwk.alg = alg;

const publicJwk = createPublicKey(createPrivateKey({ key: privateJwk, format: 'jwk' })).export({ format: 'jwk' });
publicJwk.kid = kid;
publicJwk.use = 'sig';
publicJwk.alg = alg;

const privateJwks = { keys: [privateJwk] };
const publicJwks = { keys: [publicJwk] };

mkdirSync(outputDir, { recursive: true });
writeFileSync(privateJwksPath, `${JSON.stringify(privateJwks, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
writeFileSync(publicJwksPath, `${JSON.stringify(publicJwks, null, 2)}\n`, { flag: 'wx' });

console.log(`Wrote private JWKS: ${privateJwksPath}`);
console.log(`Wrote public JWKS:  ${publicJwksPath}`);
console.log(`Signing kid:        ${kid}`);
console.log('');
console.log('Terraform/Secrets Manager values:');
console.log(`CLIENT6_TOKEN_ENDPOINT_AUTH_SIGNING_ALG=${alg}`);
console.log(`CLIENT6_PRIVATE_JWT_SIGNING_KID=${kid}`);
console.log(`CLIENT6_PRIVATE_JWKS=${JSON.stringify(privateJwks)}`);
