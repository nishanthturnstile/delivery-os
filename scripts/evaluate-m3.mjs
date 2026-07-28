import { readFile } from 'node:fs/promises';

const mode = process.argv[2];
if (mode !== 'ocr' && mode !== 'requirements') {
  process.stderr.write('Usage: node scripts/evaluate-m3.mjs <ocr|requirements>\n');
  process.exitCode = 2;
} else {
  const fixture = JSON.parse(
    await readFile(new URL(`../tests/fixtures/m3/${mode}-promotion.json`, import.meta.url), 'utf8'),
  );
  if (fixture.schemaVersion !== '1' || fixture.dataClassification !== 'SYNTHETIC') {
    throw new Error('M3_EVALUATION_FIXTURE_INVALID');
  }
  const digestVariable =
    mode === 'ocr' ? 'OCR_PROMOTED_MODEL_DIGEST' : 'REQUIREMENT_PROMOTED_CONFIG_DIGEST';
  const resultVariable =
    mode === 'ocr' ? 'OCR_EVALUATION_RESULT_PATH' : 'REQUIREMENT_EVALUATION_RESULT_PATH';
  const digest = process.env[digestVariable];
  if (digest === undefined || !/^[a-f0-9]{64}$/.test(digest)) {
    process.stderr.write(
      `${mode === 'ocr' ? 'OCR_PROMOTION_CONFIGURATION_MISSING' : 'AI_PROMOTION_DECISION_MISSING'}: ` +
        `${digestVariable} must identify the authorized exact promoted configuration. ` +
        'Deterministic fake results are not production evidence.\n',
    );
    process.exitCode = 1;
  } else {
    const resultPath = process.env[resultVariable];
    if (resultPath === undefined) {
      process.stderr.write(
        `FROZEN_EVALUATION_RESULT_MISSING: ${resultVariable} must identify the sanitized ` +
          'accountable-human-reviewed result. Fixture metadata alone is not promotion evidence.\n',
      );
      process.exitCode = 1;
    } else {
      const result = JSON.parse(await readFile(resultPath, 'utf8'));
      verifyResult({ fixture, result, digest, mode });
      process.stdout.write(
        `Accepted frozen ${mode} run ${result.run} passed for ${digest} ` +
          `using fixture ${fixture.fixtureVersion}.\n`,
      );
    }
  }
}

function verifyResult({ fixture, result, digest, mode }) {
  const requestedRun = Number.parseInt(
    process.argv.find((argument) => argument.startsWith('--run='))?.slice(6) ?? '0',
    10,
  );
  if (
    result.schemaVersion !== '1' ||
    result.dataClassification !== 'SYNTHETIC' ||
    result.fixtureVersion !== fixture.fixtureVersion ||
    result.exactPromotionDigest !== digest ||
    result.reviewStatus !== 'ACCEPTED' ||
    result.accountableReviewer !== 'Nishanth' ||
    !Number.isInteger(result.run) ||
    result.run < 1 ||
    (requestedRun !== 0 && result.run !== requestedRun)
  ) {
    throw new Error('M3_EVALUATION_EVIDENCE_INVALID');
  }
  if (mode === 'ocr' && !/^[a-f0-9]{64}$/.test(result.exactImageDigest ?? '')) {
    throw new Error('M3_OCR_IMAGE_DIGEST_INVALID');
  }
  const metrics = result.metrics;
  for (const [name, threshold] of Object.entries(fixture.promotionThresholds)) {
    const value = metrics?.[name];
    if (typeof threshold === 'boolean') {
      if (value !== threshold) throw new Error(`M3_EVALUATION_THRESHOLD_FAILED:${name}`);
    } else if (name.endsWith('Maximum')) {
      if (typeof value !== 'number' || value > threshold) {
        throw new Error(`M3_EVALUATION_THRESHOLD_FAILED:${name}`);
      }
    } else if (typeof value !== 'number' || value < threshold) {
      throw new Error(`M3_EVALUATION_THRESHOLD_FAILED:${name}`);
    }
  }
}
