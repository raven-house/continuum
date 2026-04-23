/**
 * Simple test script for the simple-attestor flow.
 *
 * This demonstrates:
 * 1. Creating an Attester from a secret key
 * 2. Attesting an array of Field elements
 * 3. Converting signature to bytes
 */
import { Attester, Fr, computeAttestationHash, signatureToBytes } from "./src/index.js";
async function main() {
    console.log("=== Simple Attestor Test Flow ===\n");
    // Step 1: Create an attester with a test secret key
    // In production, this should be a secure secret key
    const testSecretKey = Fr.fromString("0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0");
    console.log("1. Creating Attester...");
    const attester = await Attester.create(testSecretKey);
    console.log("   ✓ Attester created");
    console.log(`   Public Key X: ${attester.publicKey.x.toString()}`);
    console.log(`   Public Key Y: ${attester.publicKey.y.toString()}`);
    // Step 2: Prepare some fields to attest
    // These could be any data you want to sign (e.g., transaction data, state commitments)
    console.log("\n2. Preparing fields to attest...");
    const fields = [
        new Fr(1), // Simple number
        new Fr(42), // Another number
        Fr.fromString("0xdeadbeef"), // Hex value
        Fr.fromString("12345678901234567890"), // Large number as string
    ];
    console.log(`   ✓ Prepared ${fields.length} fields to attest:`);
    fields.forEach((f, i) => console.log(`     Field ${i}: ${f.toString()}`));
    // Step 3: Create attestation (hash + sign)
    console.log("\n3. Creating attestation...");
    const attestation = await attester.attest(fields);
    console.log({attestation})
    console.log("   ✓ Attestation created");
    console.log(`   Hash: ${attestation.hash.toString()}`);
    console.log(`   Signature: ${attestation.signature.slice(0, 30)}...${attestation.signature.slice(-10)}`);
    console.log(`   Signature length: ${attestation.signature.length} chars (64 bytes)`);
    // Step 4: Convert signature to bytes (useful for Noir contract calls)
    console.log("\n4. Converting signature to bytes...");
    const sigBytes = signatureToBytes(attestation.signature);
    console.log(`   ✓ Signature as byte array (first 8 bytes): [${sigBytes.slice(0, 8).join(", ")}, ...]`);
    // Step 5: Verify hash computation matches
    console.log("\n5. Verifying hash computation...");
    const recomputedHash = await computeAttestationHash(fields);
    const hashMatches = attestation.hash.equals(recomputedHash);
    console.log(`   ✓ Hash recomputed: ${hashMatches ? "MATCHES" : "MISMATCH!"}`);
    // Step 6: Show public key in bytes format (for Noir)
    console.log("\n6. Public key for Noir verification:");
    const pk = attester.publicKey;
    const pkXHex = `0x${pk.x.toBuffer().toString("hex")}`;
    const pkYHex = `0x${pk.y.toBuffer().toString("hex")}`;
    console.log(`   x: ${pkXHex}`);
    console.log(`   y: ${pkYHex}`);
    // Summary
    console.log("\n=== Test Complete ===");
    console.log("\nAttestation result (for Noir contract):");
    console.log(`  public_key_x: ${pkXHex}`);
    console.log(`  public_key_y: ${pkYHex}`);
    console.log(`  signature: ${attestation.signature}`);
    console.log(`  fields: [${fields.map(f => f.toString()).join(", ")}]`);
    console.log(`\nUse these values in your Noir contract with:`);
    console.log(`  assert_valid_attestation(pubkey, signature, fields);`);
}
// Run the test
main().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
