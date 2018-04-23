<h2>EC2_rev2.ps1</h2>

This script will cycle through all accounts and regions within your organization and put all EC2 instances into a csv file. 

You must fill in the  $awsOrgs array variable with the account names from your AWS credentials file you configured with the CLI. 

This will query for the Instance Type, Instance State (Running/Stopped), as well as tags (Name, Project).
