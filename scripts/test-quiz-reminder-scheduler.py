"""Execute the actual workflow Python against a fake HTTP transport and clock."""
import contextlib, io, json, os, pathlib, unittest, urllib.request, urllib.error
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / '.github/workflows/daily-jewellery-quiz.yml').read_text()
CODE = '\n'.join(line[10:] for line in WORKFLOW.split("          python3 - <<'PYTHON'\n",1)[1].split('          PYTHON',1)[0].splitlines())

class Response(io.BytesIO):
    def __init__(self, data): super().__init__(json.dumps(data).encode())

class SchedulerTest(unittest.TestCase):
    def run_workflow(self, repeat=60, fail=None, states=None, request_seconds=0):
        calls=[]; sleeps=[]; tokens=[]; posts=0; clock=0
        def sleep(seconds):
            nonlocal clock
            sleeps.append(seconds);clock+=seconds
        def urlopen(request, timeout=None):
            nonlocal posts, clock
            url=request if isinstance(request,str) else request.full_url
            calls.append(url)
            if url.endswith('/health'): return Response({'version':'daily-jewellery-quiz-reminders-v4'})
            if 'oidc.test' in url:
                token='private-jwt-'+str(len(tokens));tokens.append(token);return Response({'value':token})
            posts+=1;clock+=request_seconds
            if fail and (fail==401 or posts<3):
                raise urllib.error.HTTPError(url,fail,'hidden error',{},Response({'code':'ERR_JWT_CLAIM_VALIDATION_FAILED','claim':'aud','token':'DO_NOT_PRINT'}))
            data=states[min(posts-1,len(states)-1)] if states else {'sent':0,'checkAgainInSeconds':repeat}
            return Response({'ok':True,'data':data})
        output=io.StringIO()
        with patch.dict(os.environ,{'ACTIONS_ID_TOKEN_REQUEST_URL':'https://oidc.test/token','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'private-request-token'}), patch.object(urllib.request,'urlopen',urlopen), patch('time.sleep',sleep), patch('time.monotonic',lambda:clock), contextlib.redirect_stdout(output):
            try:exec(compile(CODE,'actual-workflow','exec'),{})
            except SystemExit as error:return calls,sleeps,tokens,posts,output.getvalue(),str(error)
        return calls,sleeps,tokens,posts,output.getvalue(),None

    def test_normal_or_test_gap_keeps_runner_active_without_browser(self):
        _,sleeps,tokens,posts,output,error=self.run_workflow()
        self.assertIsNone(error);self.assertEqual(posts,240);self.assertEqual(len(tokens),240)
        self.assertEqual(sleeps,[60]*239);self.assertNotIn('private-request-token',output)
        self.assertIn("cron: '3-59/5 * * * *'",WORKFLOW)
        self.assertIn('timeout-minutes: 270',WORKFLOW)

    def test_idle_before_admin_activation_does_not_prevent_second_notification(self):
        states=[{'sent':0,'started':False,'reason':'Waiting for Admin to click Send / Check Now on this question.','checkAgainInSeconds':None},
                {'sent':1,'started':True,'reason':'First notification','checkAgainInSeconds':60},
                {'sent':1,'started':True,'reason':'Second notification','checkAgainInSeconds':60},
                {'sent':0,'started':True,'reason':'This question is already answered; reminders stopped.','checkAgainInSeconds':None}]
        _,sleeps,tokens,posts,output,error=self.run_workflow(states=states)
        self.assertIsNone(error);self.assertEqual(posts,240)
        self.assertIn('Second notification',output);self.assertEqual(len(sleeps),239)

    def test_pause_empty_audience_answer_and_end_of_day_are_idle_not_shutdown(self):
        for reason in ['A published question is required.','No eligible employees are selected.','Quiz or notifications are paused.','This question is already answered; reminders stopped.','Outside notification hours (IST).']:
            with self.subTest(reason=reason):
                _,sleeps,tokens,posts,output,error=self.run_workflow(states=[{'sent':0,'reason':reason,'checkAgainInSeconds':None}])
                self.assertIsNone(error);self.assertEqual(posts,240);self.assertEqual(sleeps,[60]*239)
                self.assertNotIn('"sent": 1',output)

    def test_transient_failure_retries_with_fresh_signed_token(self):
        _,sleeps,tokens,posts,_,error=self.run_workflow(repeat=None,fail=503)
        self.assertIsNone(error);self.assertEqual(posts,242);self.assertEqual(len(tokens),242);self.assertEqual(sleeps[:2],[5,10])

    def test_slow_requests_are_bounded_by_four_hour_wall_clock(self):
        _,sleeps,tokens,posts,_,error=self.run_workflow(request_seconds=120)
        self.assertIsNone(error);self.assertEqual(posts,80);self.assertEqual(len(tokens),80)

    def test_auth_failure_is_safe_and_not_silently_green(self):
        _,_,tokens,posts,output,error=self.run_workflow(fail=401)
        self.assertEqual(posts,1);self.assertIn('HTTP 401',error);self.assertIn('aud',error)
        self.assertNotIn('DO_NOT_PRINT',error);self.assertNotIn(tokens[0],error)

if __name__ == '__main__': unittest.main()
