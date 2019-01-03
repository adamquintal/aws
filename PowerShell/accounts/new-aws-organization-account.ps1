
<#
.SYNOPSIS
Creates a new AWS account within the an AWS Organization

.DESCRIPTION
This cmdlet with execute a new AWS account, Security Groups, IAM Policies and request input for new accounts.

.PARAMETER AccountName
Specify the name of the new account (e.g. corp-api)

.EXAMPLE
New-AWSAccount -AccountName corp-api

.NOTES
Automate AWS account creation
This script will take input of an AccountName variable, and pass it to several functions to configure a new AWS Account within your organization
Configuration tasks are: Security Group Creation, Key Pair Creation, EC2 Policy creation, IAM Group creation, Password Policy creation and prompt for usernames if desired. 
#>

# This function will create a security group for the new account
function New-SecurityGroup ($AccountName) {

# Public IP addresses of corporate sites
$ipAddress = "1.1.1.1/32", "2.2.2.2/32", "3.3.3.3/32"
# SSH, RDP, HTTP and HTTPS
$port = 22, 3389, 80, 443
# N. Virginia, Ohio, London and Ireland 
$awsregions = "us-east-1", "us-east-2", "eu-west-1", "eu-west-2", "eu-central-1"    
# Get names of all Security Groups
$sgNames = Get-EC2SecurityGroup -Region us-east-1 -ProfileName $AccountName | ForEach-Object {$_.GroupName}

    if ($sgNames -match $AccountName)
    {
    Write-Host "A Security Group named ($AccountName)SecurityGroup already exists" -ForegroundColor Blue
    }
    else 
    {
    foreach ($region in $awsregions)
    {
    # Create Security Group
    New-EC2SecurityGroup -GroupName "($AccountName)SecurityGroup" -GroupDescription "($AccountName)SecurityGroup" -Region $region -ProfileName $AccountName -Force  
    }
    foreach ($ip in $ipAddress)
    {
        foreach ($awsPort in $port)
        { 
            foreach ($region in $awsregions)       
            {
             $ip1 = new-object Amazon.EC2.Model.IpPermission
             $ip1.IpProtocol = "tcp" 
             $ip1.FromPort = $awsPort 
             $ip1.ToPort = $awsPort 
             $ip1.IpRanges.Add($ip) 
             # Create Security Group rules
             Grant-EC2SecurityGroupIngress -GroupName "($AccountName)SecurityGroup" -IpPermissions $ip1 -Region $region -ProfileName $AccountName -Force 
            }
         }
     }
     Write-Host "Security Group ($AccountName)SecurityGroup has been created in all regions, and inbound/outbound rules have been created." -ForegroundColor Magenta
    } 
    # Create a key pair for each region and store in C:\AWSAccounts
    foreach ($region in $awsregions)
    {
        $keypair = New-EC2KeyPair -KeyName "($AccountName)-$($region)KeyPair" -Region $region -ProfileName $AccountName
        $keypair.KeyMaterial | Out-File -Encoding ascii C:\AWSAccounts\$AccountName-$($region)KeyPair.pem
        Write-Host "Your EC2 Key Pair for the $($region) has been stored on C:\AWSAccounts"
    }
}

function New-IAMEC2Policy ($AccountName) {

    $awsOrgAccount = Get-ORGAccountList -Region us-east-1 | Where-Object {$_.Name -eq $($AccountName)}    
    $id = $awsOrgAccount.Id

$policy =@"
{
    "Version": "2012-10-17",
     "Statement": [
            {
                "Sid": "AllowAllEC2",
                "Effect": "Allow",
                "Action": "ec2:*",
                "Resource": "*",
                "Condition": {
                    "StringEquals": {
                        "ec2:Region": [
                            "us-east-1",
                            "us-east-2",
                            "eu-west-2",
                            "eu-west-1"
                        ]
                    }
                }
            },
            {
                "Sid": "DenyIfNoTags",
                "Effect": "Deny",
                "Action": "ec2:RunInstances",
                "Resource": [
                    "arn:aws:ec2:*:$($id):volume/*",
                    "arn:aws:ec2:*:$($id):instance/*"
                ],
                "Condition": {
                    "ForAllValues:StringNotEquals": {
                        "aws:TagKeys": [
                            "Owner",
                            "Project",
                            "Name"
                        ]
                    }
                }
            },
            {
                "Sid": "DenyKeyAndSecurityGroup",
                "Effect": "Deny",
                "Action": [
                    "ec2:CreateSecurityGroup",
                    "ec2:CreateKeyPair",
                    "ec2:AuthorizeSecurityGroupEgress",
                    "ec2:AuthorizeSecurityGroupIngress",
                    "ec2:RevokeSecurityGroupEgress",
                    "ec2:RevokeSecurityGroupIngress"
                ],
                "Resource": "*"
            },
            {
                "Sid": "DenyDeleteTags",
                "Effect": "Deny",
                "Action": "ec2:DeleteTags",
                "Resource": [
                    "arn:aws:ec2:*:$($id):volume/*",
                    "arn:aws:ec2:*:$($id):instance/*"
                ],
                "Condition": {
                    "ForAnyValue:StringEquals": {
                        "aws:TagKeys": [
                            "Owner",
                            "Project",
                            "Name"
                        ]
                    }
                }
            }
        ]
    }
"@ 
         $IAMGroups = Get-IAMGroupList -ProfileName $AccountName | ForEach-Object {$_.GroupName}

         if ($IAMGroups -match "($AccountName)")
         {
           Write-Host "An IAM Group named ($AccountName)SecurityGroup already exists" -ForegroundColor Blue
         }
         else
         {
           New-IAMGroup -GroupName "($AccountName)" -ProfileName $AccountName -ErrorAction Ignore
           New-IAMPolicy -PolicyName "($AccountName)EC2Policy" -PolicyDocument $policy -Description "EC2 Policy for $($AccountName)" -ProfileName $AccountName
           Register-IAMGroupPolicy -GroupName "$AccountName" -PolicyArn "arn:aws:iam::$($id):policy/$AccountNameEC2Policy" -ProfileName $AccountName
           Write-Host "An IAM Group named $AccountName has been created, and the policy has been attached." -ForegroundColor Blue
         } 

}
function  New-IAMUsers ($AccountName) {

    $awsOrgAccount = Get-ORGAccountList -Region us-east-1 | Where-Object {$_.Name -eq $($AccountName)}    
    $id = $awsOrgAccount.Id
    # Apply IAM Password policy (Max Age 60, Min length 8, LowerCase letter, UpperCase letter, Number and Special character )
    Update-IAMAccountPasswordPolicy -AllowUsersToChangePassword $true -MaxPasswordAge 60 -MinimumPasswordLength 8 -PasswordReusePrevention 2 -RequireLowercaseCharacter $true -RequireNumber $true -RequireSymbol $true -RequireUppercaseCharacter $true -ProfileName $AccountName

    Write-Host "Password policy has been applied" -ForegroundColor Blue
    
    $msg = "Would you like to create an IAM user? y/n"

    do {
        $response = Read-Host -Prompt $msg
        if ($response -eq 'y')
        {    
        $IAMUserName = Read-Host "Enter a username for the $($AccountName) account: "
        $IAMUserName = $IAMUserName -Replace '\s',''
        $IAMUserName = $IAMUserName.ToLower()
        New-IAMUser -UserName $IAMUserName -ProfileName $AccountName -Verbose 
        Write-Host "User $($IAMUserName) has been created..." -ForegroundColor Blue
        Add-IAMUserToGroup -UserName $IAMUserName -GroupName "$($AccountName)" -Verbose -ProfileName $AccountName
        Write-Host "User $($IAMUserName) has been added to the $($AccountName) Group"
        New-IAMLoginProfile -UserName $IAMUserName -Password "<PASSWORDHERE>" -PasswordResetRequired $true -ProfileName $AccountName     
        $userMessage =@"
Hello, 
        
I have created an account for you in AWS. Please note the below login credentials. If you have any questions feel free to reach out directly. 

login url: https://$($id).signin.aws.amazon.com/console

username: $($IAMUserName)

password: ##PasswordHere##

Thank you,
      
"@
        Out-File -InputObject $userMessage -FilePath C:\AWSAccounts\$IAMUserName.txt
        Write-Host "IAM User information for $($IAMUserName) has been saved to C:\AWSAccounts\$($IAMUserName).txt" -ForegroundColor Magenta
        }           
    }
    until ($response -eq 'n')   
}

function  New-CloudWatchAlert ($AccountName) {
    
}

function New-CloudTrailLog ($AccountName) {
    
}

function New-AWSAccount ($AccountName) {

    $awsOrgAccount = Get-ORGAccountList -Region us-east-1 | Where-Object {$_.Name -eq $($AccountName)}    
    $id = $awsOrgAccount.Id

    # Remove any spaces from AccountName variable
    $AccountName = $AccountName -Replace '\s',''
    $AccountName = $AccountName.ToLower()

    $orgNames = Get-OrgAccountList -Region us-east-1  | ForEach-Object {$_.Name}
    if ($orgNames -eq $AccountName)
    {
        Write-Host "An account with that name already exists"
    }
    else {
        
    New-ORGAccount -AccountName $AccountName -Email "aws-$($AccountName)@waters.com" -Region us-east-1 
    
    # Wait 100 seconds for account creation to complete
    for ($a=100; $a -gt 1; $a--) {
        Write-Progress -Activity "Creating the $($AccountName) account within the Organization..." -SecondsRemaining $a -Status "Please wait."
        Start-Sleep 1
      }
      
    $awsOrgAccount = Get-ORGAccountList -Region us-east-1 | Where-Object {$_.Name -eq $($AccountName)}    
    $id = $awsOrgAccount.Id
    # Create new AWS credential with new account name 
    Set-AWSCredential -RoleArn "arn:aws:iam::$($id):role/OrganizationAccountAccessRole" -StoreAs $AccountName -SourceProfile default
    # Call security group function to create standard rules in default VPC
    New-SecurityGroup -AccountName $AccountName -Profile $AccountName
    # Call IAM function to create IAM Policy and create new group
    New-IAMEC2Policy -AccountNumber $id -AccountName $AccountName
    # Call IAM User accoutn creation function
    New-IAMUsers -AccountName $AccountName -AccountNumber $id
    }
}
