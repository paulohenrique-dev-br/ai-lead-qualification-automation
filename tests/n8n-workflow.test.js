'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  __dirname,
  '..',
  'n8n',
  'lead-qualification-workflow.json',
);

test('exports a parseable n8n workflow with the required flow', () => {
  assert.equal(fs.existsSync(workflowPath), true);

  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const names = workflow.nodes.map((node) => node.name);
  const requiredNodes = [
    'Webhook',
    'Validate Input',
    'Check Duplicate',
    'Merge Check + Input',
    'Evaluate Duplicate',
    'Is Duplicate?',
    'Respond Duplicate',
    'Prepare LLM Request',
    'LLM HTTP Request',
    'Merge LLM + Lead',
    'Validate Structured Output',
    'Apply Business Rules',
    'Persist Lead',
    'Merge Persist + Record',
    'Respond',
  ];

  for (const name of requiredNodes) {
    assert.ok(names.includes(name), `Missing node: ${name}`);
  }

  assert.equal(workflow.connections.Webhook.main[0][0].node, 'Validate Input');
  assert.equal(
    workflow.connections['Validate Input'].main[0][0].node,
    'Check Duplicate',
  );
  assert.equal(
    workflow.connections['Validate Input'].main[0][1].node,
    'Merge Check + Input',
  );
  assert.equal(
    workflow.connections['Check Duplicate'].main[0][0].node,
    'Merge Check + Input',
  );
  assert.equal(
    workflow.connections['Merge Check + Input'].main[0][0].node,
    'Evaluate Duplicate',
  );
  assert.equal(
    workflow.connections['Is Duplicate?'].main[1][0].node,
    'Prepare LLM Request',
  );
  assert.equal(
    workflow.connections['Prepare LLM Request'].main[0][0].node,
    'LLM HTTP Request',
  );
  assert.equal(
    workflow.connections['Prepare LLM Request'].main[0][1].node,
    'Merge LLM + Lead',
  );
  assert.equal(
    workflow.connections['LLM HTTP Request'].main[0][0].node,
    'Merge LLM + Lead',
  );
  assert.equal(
    workflow.connections['Merge LLM + Lead'].main[0][0].node,
    'Validate Structured Output',
  );
  assert.equal(
    workflow.connections['Validate Structured Output'].main[0][0].node,
    'Apply Business Rules',
  );
  assert.equal(
    workflow.connections['Apply Business Rules'].main[0][0].node,
    'Persist Lead',
  );
  assert.equal(
    workflow.connections['Apply Business Rules'].main[0][1].node,
    'Merge Persist + Record',
  );
  assert.equal(
    workflow.connections['Persist Lead'].main[0][0].node,
    'Merge Persist + Record',
  );
  assert.equal(
    workflow.connections['Merge Persist + Record'].main[0][0].node,
    'Respond',
  );
});

test('uses the real webhook body and no temporary global state', () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const validateInput = workflow.nodes.find((node) => node.name === 'Validate Input');

  assert.match(validateInput.parameters.jsCode, /envelope\.body/);
  assert.doesNotMatch(validateInput.parameters.jsCode, /const body = \$input\.item\.json/);

  const raw = fs.readFileSync(workflowPath, 'utf8');
  assert.doesNotMatch(raw, /fetch\(/);
  assert.doesNotMatch(raw, /getWorkflowStaticData/);

  const llmNode = workflow.nodes.find((node) => node.name === 'LLM HTTP Request');
  assert.equal(llmNode.type, 'n8n-nodes-base.httpRequest');
  assert.equal(llmNode.parameters.method, 'POST');
  assert.equal(llmNode.retryOnFail, undefined);
});

test('uses compatible Merge v3 configuration and expected inputs', () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const mergeNames = [
    'Merge Check + Input',
    'Merge LLM + Lead',
    'Merge Persist + Record',
  ];

  for (const name of mergeNames) {
    const node = workflow.nodes.find((item) => item.name === name);
    assert.equal(node.type, 'n8n-nodes-base.merge');
    assert.equal(node.typeVersion, 3);
    assert.equal(node.parameters.mode, 'combine');
    assert.equal(node.parameters.combineBy, 'combineByPosition');
    assert.equal(node.parameters.combinationMode, undefined);
  }

  assert.equal(
    workflow.connections['Check Duplicate'].main[0][0].node,
    'Merge Check + Input',
  );
  assert.equal(
    workflow.connections['Validate Input'].main[0][1].node,
    'Merge Check + Input',
  );
  assert.equal(
    workflow.connections['LLM HTTP Request'].main[0][0].node,
    'Merge LLM + Lead',
  );
  assert.equal(
    workflow.connections['Prepare LLM Request'].main[0][1].node,
    'Merge LLM + Lead',
  );
  assert.equal(
    workflow.connections['Persist Lead'].main[0][0].node,
    'Merge Persist + Record',
  );
  assert.equal(
    workflow.connections['Apply Business Rules'].main[0][1].node,
    'Merge Persist + Record',
  );
});

test('does not embed real-looking API keys or credentials', () => {
  const raw = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(raw, /sk-[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(raw, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
});
